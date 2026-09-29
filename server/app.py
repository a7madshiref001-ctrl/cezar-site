from __future__ import annotations

import json
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import ROOT, get_settings
from .db import Base, engine, get_db
from .models import AdminAuditLog, Order, WebhookEvent
from .membership import router as membership_router
from .pricing import calculate
from .schemas import OrderCreate, OrderOut
from .security import require_admin, valid_signature


settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(
    title="CEZAR GYM API",
    docs_url=None if settings.environment == "production" else "/docs",
    lifespan=lifespan,
)
app.include_router(membership_router)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.update({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Content-Security-Policy": (
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' "
            "https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; "
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        ),
    })
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith(("/api/member/", "/api/admin/")) or request.url.path in {"/member.html", "/staff.html"}:
        response.headers["Cache-Control"] = "no-store"
    if request.url.path in {"/member.html", "/staff.html"}:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; "
            "font-src https://fonts.gstatic.com; img-src 'self'; connect-src 'self'; "
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )
    return response


@app.exception_handler(Exception)
async def unhandled_error(_: Request, exc: Exception):
    if settings.environment != "production":
        raise exc
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


def order_out(order: Order) -> OrderOut:
    value = OrderOut.model_validate(order)
    if order.provider_session_id and order.status == "awaiting_payment":
        value.checkout_url = f"{settings.public_base_url}/api/payments/mock/{order.id}"
    return value


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok", "service": "cezar-gym", "payment_mode": settings.payment_mode}


@app.post("/api/orders", response_model=OrderOut, status_code=201)
def create_order(
    payload: OrderCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    if not idempotency_key or not 8 <= len(idempotency_key) <= 128:
        raise HTTPException(status_code=400, detail="A valid Idempotency-Key header is required")
    existing = db.scalar(select(Order).where(Order.idempotency_key == idempotency_key))
    if existing:
        return order_out(existing)
    try:
        amount = calculate(payload.plan_type, payload.plan_id, payload.friends, payload.people)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    manual = payload.payment_method in {"cash", "vodafone", "instapay"}
    provider = "manual" if manual else settings.payment_mode
    status = "pending_manual" if manual else "awaiting_payment"
    order = Order(
        idempotency_key=idempotency_key,
        status=status,
        provider=provider,
        provider_session_id=None if manual else secrets.token_urlsafe(24),
        plan_id=payload.plan_id,
        plan_type=payload.plan_type,
        amount=amount,
        currency="EGP",
        customer_name=payload.customer_name,
        phone=payload.phone,
        gender=payload.gender,
        notes=payload.notes,
        payment_method=payload.payment_method,
        people=payload.people if payload.friends else 1,
    )
    db.add(order)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(Order).where(Order.idempotency_key == idempotency_key))
        if existing:
            return order_out(existing)
        raise
    db.refresh(order)
    return order_out(order)


@app.get("/api/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: str, db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order_out(order)


def process_payment_event(payload: dict, raw: str, db: Session) -> Order:
    required = {"event_id", "order_id", "transaction_id", "amount", "currency", "status"}
    if not required.issubset(payload):
        raise HTTPException(status_code=422, detail="Incomplete payment event")
    duplicate = db.scalar(select(WebhookEvent).where(
        WebhookEvent.provider == payload.get("provider", "mock"),
        WebhookEvent.event_id == str(payload["event_id"]),
    ))
    if duplicate:
        order = db.get(Order, str(payload["order_id"]))
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        return order
    order = db.get(Order, str(payload["order_id"]))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if int(payload["amount"]) != order.amount or str(payload["currency"]).upper() != order.currency:
        raise HTTPException(status_code=400, detail="Payment amount or currency mismatch")
    if payload["status"] not in {"paid", "failed"}:
        raise HTTPException(status_code=422, detail="Unsupported payment status")
    event = WebhookEvent(provider=payload.get("provider", "mock"), event_id=str(payload["event_id"]), payload=raw)
    db.add(event)
    order.status = "paid" if payload["status"] == "paid" else "payment_failed"
    order.provider_transaction_id = str(payload["transaction_id"])
    order.raw_payment_event = raw
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return db.get(Order, order.id)
    db.refresh(order)
    return order


@app.post("/api/payments/webhook")
async def payment_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    if not valid_signature(body, request.headers.get("X-Cezar-Signature")):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc
    order = process_payment_event(payload, body.decode("utf-8"), db)
    return {"received": True, "order_id": order.id, "status": order.status}


@app.get("/api/payments/mock/{order_id}", response_class=HTMLResponse)
def mock_checkout(order_id: str, db: Session = Depends(get_db)):
    if settings.payment_mode not in {"mock", "test"}:
        raise HTTPException(status_code=404)
    order = db.get(Order, order_id)
    if not order or order.provider not in {"mock", "test"}:
        raise HTTPException(status_code=404, detail="Order not found")
    return f"""<!doctype html><html lang='ar' dir='rtl'><meta charset='utf-8'><title>دفع تجريبي</title>
    <body style='font-family:sans-serif;max-width:520px;margin:80px auto;padding:24px'><h1>بوابة دفع تجريبية</h1>
    <p>الطلب {order.id}<br>المبلغ {order.amount} EGP</p>
    <a href='/api/payments/mock/{order.id}/complete?result=success'>محاكاة نجاح</a> ·
    <a href='/api/payments/mock/{order.id}/complete?result=failure'>محاكاة فشل</a></body></html>"""


@app.get("/api/payments/mock/{order_id}/complete")
def mock_complete(order_id: str, result: str, db: Session = Depends(get_db)):
    if settings.payment_mode not in {"mock", "test"} or result not in {"success", "failure"}:
        raise HTTPException(status_code=404)
    order = db.get(Order, order_id)
    if not order or order.provider not in {"mock", "test"}:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "awaiting_payment":
        process_payment_event({
            "provider": order.provider, "event_id": secrets.token_hex(12), "order_id": order.id,
            "transaction_id": "mock_" + secrets.token_hex(8), "amount": order.amount,
            "currency": order.currency, "status": "paid" if result == "success" else "failed",
        }, json.dumps({"mock": result}), db)
    return RedirectResponse(f"/payment-return?order_id={order.id}", status_code=303)


@app.get("/api/payments/return")
def payment_return(order_id: str):
    return RedirectResponse(f"/payment-return?order_id={order_id}", status_code=303)


@app.get("/api/admin/orders", response_model=list[OrderOut], dependencies=[Depends(require_admin)])
def admin_orders(limit: int = 100, db: Session = Depends(get_db)):
    limit = max(1, min(limit, 500))
    orders = db.scalars(select(Order).order_by(Order.created_at.desc()).limit(limit)).all()
    db.add(AdminAuditLog(action="list_orders", detail=f"limit={limit}"))
    db.commit()
    return [order_out(order) for order in orders]


@app.get("/robots.txt", response_class=Response)
def robots():
    return Response(
        f"User-agent: *\nAllow: /\nDisallow: /owner.html\nDisallow: /staff.html\nDisallow: /member.html\nDisallow: /offers.html\nSitemap: {settings.public_base_url}/sitemap.xml\n",
        media_type="text/plain",
    )


@app.get("/sitemap.xml", response_class=Response)
def sitemap():
    return Response(
        f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        f"<url><loc>{settings.public_base_url}/</loc></url><url><loc>{settings.public_base_url}/join.html</loc></url></urlset>",
        media_type="application/xml",
    )


@app.get("/payment-return", response_class=HTMLResponse)
def payment_return_page():
    return (ROOT / "payment-return.html").read_text(encoding="utf-8")


def html_page(name: str) -> HTMLResponse:
    html = (ROOT / name).read_text(encoding="utf-8")
    html = html.replace("https://a7madshiref001-ctrl.github.io/cezar-site", settings.public_base_url)
    return HTMLResponse(html)


@app.get("/", response_class=HTMLResponse)
def homepage():
    return html_page("index.html")


@app.get("/index.html", response_class=HTMLResponse)
def homepage_alias():
    return html_page("index.html")


@app.get("/join.html", response_class=HTMLResponse)
def join_page():
    return html_page("join.html")


@app.get("/owner.html", response_class=HTMLResponse)
def owner_page():
    return html_page("owner.html")


@app.get("/member.html", response_class=HTMLResponse)
def member_page():
    return html_page("member.html")


@app.get("/staff.html", response_class=HTMLResponse)
def staff_page():
    return html_page("staff.html")


@app.get("/offers.html", response_class=HTMLResponse)
def offers_page():
    return html_page("offers.html")


app.mount("/assets", StaticFiles(directory=ROOT / "assets"), name="assets")
app.mount("/data", StaticFiles(directory=ROOT / "data"), name="data")
