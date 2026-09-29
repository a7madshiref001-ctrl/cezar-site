from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .config import get_settings
from .gym_api import GymAPI, GymAPIError
from .models import AdminAuditLog, Attendance, GymDispatch, GymMemberLink, LoginThrottle, Member, MemberSession, Membership, Order
from .security import require_admin


router = APIRouter()
SESSION_SECONDS = 8 * 60 * 60
THROTTLE_WINDOW = timedelta(minutes=15)
THROTTLE_LIMIT = 5


def now() -> datetime:
    return datetime.now(timezone.utc)


def aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def code_hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def new_code() -> str:
    return secrets.token_urlsafe(15)


class Enrollment(BaseModel):
    order_id: str | None = None
    name: str = Field(min_length=3, max_length=120)
    phone: str = Field(pattern=r"^01[0125]\d{8}$")
    plan_name: str = Field(min_length=2, max_length=120)
    total_sessions: int = Field(ge=1, le=500)
    starts_at: datetime
    ends_at: datetime

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return " ".join(value.split())


class Login(BaseModel):
    phone: str = Field(pattern=r"^01[0125]\d{8}$")
    code: str = Field(min_length=16, max_length=64)


class ImportMember(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    phone: str = Field(pattern=r"^01[0125]\d{8}$")
    external_member_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,120}$")


def used_count(db: Session, membership_id: str) -> int:
    return db.scalar(select(func.count()).select_from(Attendance).where(
        Attendance.membership_id == membership_id, Attendance.voided_at.is_(None)
    )) or 0


def membership_data(db: Session, membership: Membership, *, include_attendance: bool = False) -> dict:
    used = used_count(db, membership.id)
    ends = aware(membership.ends_at)
    starts = aware(membership.starts_at)
    current = now()
    status = "upcoming" if current < starts else "expired" if current > ends else "finished" if used >= membership.total_sessions else "active"
    result = {
        "id": membership.id, "order_id": membership.order_id, "plan_name": membership.plan_name,
        "total_sessions": membership.total_sessions, "used_sessions": used,
        "remaining_sessions": max(0, membership.total_sessions - used),
        "starts_at": starts.isoformat(), "ends_at": ends.isoformat(), "status": status,
    }
    if include_attendance:
        records = db.scalars(select(Attendance).where(
            Attendance.membership_id == membership.id, Attendance.voided_at.is_(None)
        ).order_by(Attendance.checked_in_at.desc())).all()
        result["attendance"] = [{"id": item.id, "checked_in_at": aware(item.checked_in_at).isoformat()} for item in records]
    return result


def member_data(db: Session, member: Member, *, include_attendance: bool = False) -> dict:
    memberships = db.scalars(select(Membership).where(Membership.member_id == member.id).order_by(Membership.created_at.desc())).all()
    return {
        "id": member.id, "name": member.name, "phone": member.phone,
        "memberships": [membership_data(db, item, include_attendance=include_attendance) for item in memberships],
    }


def member_view(db: Session, member: Member) -> dict:
    result = member_data(db, member, include_attendance=True)
    link = db.get(GymMemberLink, member.id)
    result["source"] = "local"
    result["last_synced_at"] = None
    if not link or get_settings().gym_api_mode != "http":
        return result
    try:
        with GymAPI() as gym:
            snapshot = gym.dashboard(link.external_member_id)
        memberships = []
        for item in snapshot.memberships:
            used = item.used_sessions
            current = now()
            starts, ends = aware(item.starts_at), aware(item.ends_at)
            status = "upcoming" if current < starts else "expired" if current > ends else "finished" if used >= item.total_sessions else "active"
            memberships.append({
                "id": item.id, "order_id": None, "plan_name": item.plan_name,
                "total_sessions": item.total_sessions, "used_sessions": used,
                "remaining_sessions": item.total_sessions - used,
                "starts_at": starts.isoformat(), "ends_at": ends.isoformat(), "status": status,
                "attendance": [{"id": visit.id, "checked_in_at": aware(visit.checked_in_at).isoformat()} for visit in item.attendance],
            })
        link.snapshot_json = json.dumps(memberships, ensure_ascii=False)
        link.last_synced_at = now()
        db.commit()
        result.update(memberships=memberships, source="gym", last_synced_at=link.last_synced_at.isoformat())
    except GymAPIError:
        result.update(memberships=json.loads(link.snapshot_json) if link.snapshot_json else [],
                      source="cached" if link.snapshot_json else "unavailable",
                      last_synced_at=aware(link.last_synced_at).isoformat() if link.last_synced_at else None)
    return result


def throttle_key(phone: str, request: Request) -> str:
    ip = request.client.host if request.client else "unknown"
    return hashlib.sha256(f"{get_settings().admin_token}:{phone}:{ip}".encode()).hexdigest()


def require_member(db: Session = Depends(get_db), cezar_member_session: str | None = Cookie(default=None)) -> Member:
    if not cezar_member_session:
        raise HTTPException(status_code=401, detail="يرجى تسجيل الدخول")
    token_hash = code_hash(cezar_member_session)
    session = db.get(MemberSession, token_hash)
    if not session or session.revoked_at or aware(session.expires_at) <= now():
        raise HTTPException(status_code=401, detail="انتهت الجلسة، سجل دخولك من جديد")
    member = db.get(Member, session.member_id)
    if not member:
        raise HTTPException(status_code=401, detail="يرجى تسجيل الدخول")
    return member


@router.post("/api/member/login")
def member_login(payload: Login, response: Response, request: Request, db: Session = Depends(get_db)):
    key = throttle_key(payload.phone, request)
    throttle = db.get(LoginThrottle, key)
    current = now()
    if throttle and current - aware(throttle.window_started_at) < THROTTLE_WINDOW and throttle.failures >= THROTTLE_LIMIT:
        raise HTTPException(status_code=429, detail="محاولات كثيرة. حاول بعد 15 دقيقة")
    member = db.scalar(select(Member).where(Member.phone == payload.phone))
    supplied = code_hash(payload.code)
    if not member or not hmac.compare_digest(member.access_code_hash, supplied):
        if not throttle or current - aware(throttle.window_started_at) >= THROTTLE_WINDOW:
            throttle = LoginThrottle(key=key, failures=0, window_started_at=current)
            db.add(throttle)
        throttle.failures += 1
        db.commit()
        raise HTTPException(status_code=401, detail="رقم الهاتف أو رمز الدخول غير صحيح")
    if throttle:
        db.delete(throttle)
    token = secrets.token_urlsafe(32)
    db.add(MemberSession(id=code_hash(token), member_id=member.id, expires_at=current + timedelta(seconds=SESSION_SECONDS)))
    db.commit()
    response.set_cookie("cezar_member_session", token, max_age=SESSION_SECONDS, path="/api/member",
                        httponly=True, secure=get_settings().environment == "production", samesite="strict")
    response.headers["Cache-Control"] = "no-store"
    return member_view(db, member)


@router.get("/api/member/me")
def member_me(response: Response, member: Member = Depends(require_member), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return member_view(db, member)


@router.post("/api/member/logout")
def member_logout(response: Response, cezar_member_session: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    if cezar_member_session:
        session = db.get(MemberSession, code_hash(cezar_member_session))
        if session and not session.revoked_at:
            session.revoked_at = now()
            db.commit()
    response.delete_cookie("cezar_member_session", path="/api/member")
    response.headers["Cache-Control"] = "no-store"
    return {"ok": True}


@router.get("/api/admin/members", dependencies=[Depends(require_admin)])
def list_members(db: Session = Depends(get_db)):
    members = db.scalars(select(Member).order_by(Member.created_at.desc())).all()
    return [{**member_data(db, item, include_attendance=True),
             "external_member_id": db.get(GymMemberLink, item.id).external_member_id if db.get(GymMemberLink, item.id) else None,
             "sync": {membership.id: dispatch.status for membership in db.scalars(
                 select(Membership).where(Membership.member_id == item.id)).all()
                 if (dispatch := db.get(GymDispatch, membership.id))}}
            for item in members]


@router.get("/api/admin/gym/status", dependencies=[Depends(require_admin)])
def gym_status(db: Session = Depends(get_db)):
    rows = db.scalars(select(GymDispatch)).all()
    return {"configured": get_settings().gym_api_mode == "http",
            "pending": sum(item.status == "pending" for item in rows),
            "sent": sum(item.status == "sent" for item in rows),
            "error": sum(item.status == "error" for item in rows)}


def dispatch_to_gym(db: Session, membership: Membership, member: Member) -> str:
    dispatch = db.get(GymDispatch, membership.id)
    if not dispatch:
        dispatch = GymDispatch(membership_id=membership.id)
        db.add(dispatch)
    if dispatch.status == "sent":
        return "sent"
    if get_settings().gym_api_mode != "http":
        dispatch.status = "pending"
        db.commit()
        return "pending"
    dispatch.attempts += 1
    try:
        with GymAPI() as gym:
            external = gym.create_membership(
                membership_id=membership.id, order_id=membership.order_id,
                name=member.name, phone=member.phone, plan_name=membership.plan_name,
                total_sessions=membership.total_sessions, starts_at=aware(membership.starts_at),
                ends_at=aware(membership.ends_at),
            )
            external_member = gym.member(external.member_id)
        if external_member.id != external.member_id or external_member.phone != member.phone:
            raise GymAPIError("Gym API returned a different member phone")
        link = db.get(GymMemberLink, member.id)
        if link and link.external_member_id != external.member_id:
            raise GymAPIError("Gym API member ID conflicts with the linked account")
        if not link:
            linked_to = db.scalar(select(GymMemberLink.member_id).where(
                GymMemberLink.external_member_id == external.member_id))
            if linked_to and linked_to != member.id:
                raise GymAPIError("Gym API member ID is already linked to another account")
            db.add(GymMemberLink(member_id=member.id, external_member_id=external.member_id))
        dispatch.status = "sent"
        dispatch.external_membership_id = external.id
        dispatch.last_error = None
    except (GymAPIError, IntegrityError):
        dispatch.status = "error"
        dispatch.last_error = "تعذر المزامنة مع سيستم الجيم؛ حاول مرة أخرى من لوحة الإدارة"
    db.add(AdminAuditLog(action="gym_dispatch", detail=f"membership={membership.id};status={dispatch.status}"))
    db.commit()
    return dispatch.status


@router.post("/api/admin/gym/import-member", status_code=201, dependencies=[Depends(require_admin)])
def import_gym_member(payload: ImportMember, db: Session = Depends(get_db)):
    if get_settings().gym_api_mode != "http":
        raise HTTPException(status_code=409, detail="ربط سيستم الجيم غير مهيأ بعد")
    existing_link = db.scalar(select(GymMemberLink.member_id).where(
        GymMemberLink.external_member_id == payload.external_member_id))
    if existing_link:
        raise HTTPException(status_code=409, detail="معرّف سيستم الجيم مربوط بالفعل")
    try:
        with GymAPI() as gym:
            external_member = gym.member(payload.external_member_id)
            gym.dashboard(payload.external_member_id)
    except GymAPIError as exc:
        raise HTTPException(status_code=502, detail="تعذر التحقق من العضو في سيستم الجيم") from exc
    if external_member.id != payload.external_member_id or external_member.phone != payload.phone:
        raise HTTPException(status_code=422, detail="رقم موبايل العضو لا يطابق سيستم الجيم")
    member = db.scalar(select(Member).where(Member.phone == payload.phone))
    code = None
    if member:
        if db.get(GymMemberLink, member.id):
            raise HTTPException(status_code=409, detail="العضو مربوط بسيستم الجيم بالفعل")
    else:
        code = new_code()
        member = Member(name=external_member.name, phone=payload.phone, access_code_hash=code_hash(code))
    try:
        db.add(member)
        db.flush()
        db.add(GymMemberLink(member_id=member.id, external_member_id=payload.external_member_id))
        db.add(AdminAuditLog(action="import_gym_member", detail=f"member={member.id}"))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="العضو مربوط بالفعل") from exc
    return {"member_id": member.id, "access_code": code, "linked_existing": code is None}


@router.post("/api/admin/gym/retry/{membership_id}", dependencies=[Depends(require_admin)])
def retry_gym_dispatch(membership_id: str, db: Session = Depends(get_db)):
    membership = db.get(Membership, membership_id)
    if not membership:
        raise HTTPException(status_code=404, detail="الاشتراك غير موجود")
    if get_settings().gym_api_mode != "http":
        raise HTTPException(status_code=409, detail="ربط سيستم الجيم غير مهيأ بعد")
    status = dispatch_to_gym(db, membership, db.get(Member, membership.member_id))
    return {"status": status}


@router.post("/api/admin/memberships", status_code=201, dependencies=[Depends(require_admin)])
def enroll(payload: Enrollment, db: Session = Depends(get_db)):
    if aware(payload.ends_at) <= aware(payload.starts_at):
        raise HTTPException(status_code=422, detail="تاريخ الانتهاء يجب أن يكون بعد البداية")
    order = None
    if payload.order_id:
        order = db.get(Order, payload.order_id)
        if not order:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        if order.phone != payload.phone:
            raise HTTPException(status_code=422, detail="رقم الهاتف لا يطابق الطلب")
        if db.scalar(select(Membership.id).where(Membership.order_id == order.id)):
            raise HTTPException(status_code=409, detail="هذا الطلب تم تفعيله من قبل")
    member = db.scalar(select(Member).where(Member.phone == payload.phone))
    access_code = None
    try:
        if not member:
            access_code = new_code()
            member = Member(name=payload.name, phone=payload.phone, access_code_hash=code_hash(access_code))
            db.add(member)
            db.flush()
        else:
            member.name = payload.name
        membership = Membership(
            member_id=member.id, order_id=order.id if order else None,
            plan_name=payload.plan_name, total_sessions=payload.total_sessions,
            starts_at=aware(payload.starts_at), ends_at=aware(payload.ends_at),
        )
        db.add(membership)
        db.flush()
        db.add(GymDispatch(membership_id=membership.id))
        db.add(AdminAuditLog(action="enroll_member", order_id=payload.order_id, detail=f"member={member.id}"))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="تعذر حفظ الاشتراك؛ راجع الطلب أو رقم الهاتف") from exc
    sync_status = dispatch_to_gym(db, membership, member)
    return {"member": member_data(db, member, include_attendance=True), "access_code": access_code,
            "gym_sync_status": sync_status}


@router.post("/api/admin/members/{member_id}/reset-code", dependencies=[Depends(require_admin)])
def reset_code(member_id: str, db: Session = Depends(get_db)):
    member = db.get(Member, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    code = new_code()
    member.access_code_hash = code_hash(code)
    for session in db.scalars(select(MemberSession).where(MemberSession.member_id == member_id, MemberSession.revoked_at.is_(None))):
        session.revoked_at = now()
    db.add(AdminAuditLog(action="reset_member_code", detail=f"member={member_id}"))
    db.commit()
    return {"access_code": code}


@router.post("/api/admin/memberships/{membership_id}/checkins", status_code=201, dependencies=[Depends(require_admin)])
def check_in(membership_id: str, db: Session = Depends(get_db)):
    membership = db.scalar(select(Membership).where(Membership.id == membership_id).with_for_update())
    if not membership:
        raise HTTPException(status_code=404, detail="الاشتراك غير موجود")
    if get_settings().gym_api_mode == "http" and db.get(GymMemberLink, membership.member_id):
        raise HTTPException(status_code=409, detail="حضور العضو المربوط يُسجل في سيستم الجيم فقط")
    snapshot = membership_data(db, membership)
    if snapshot["status"] != "active":
        raise HTTPException(status_code=409, detail="الاشتراك غير نشط أو حصصه انتهت")
    attendance = Attendance(membership_id=membership.id)
    db.add(attendance)
    db.add(AdminAuditLog(action="check_in", detail=f"membership={membership_id}"))
    db.commit()
    return membership_data(db, membership, include_attendance=True)


@router.post("/api/admin/attendance/{attendance_id}/void", dependencies=[Depends(require_admin)])
def void_attendance(attendance_id: str, db: Session = Depends(get_db)):
    attendance = db.get(Attendance, attendance_id)
    if not attendance:
        raise HTTPException(status_code=404, detail="الحضور غير موجود")
    if attendance.voided_at:
        raise HTTPException(status_code=409, detail="تم إلغاء هذا الحضور")
    attendance.voided_at = now()
    db.add(AdminAuditLog(action="void_check_in", detail=f"attendance={attendance_id}"))
    db.commit()
    return membership_data(db, db.get(Membership, attendance.membership_id), include_attendance=True)
