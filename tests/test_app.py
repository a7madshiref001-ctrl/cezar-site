import hashlib
import hmac
import json
import uuid

from fastapi.testclient import TestClient

from server.app import app


def payload(**overrides):
    value = {
        "plan_id": "power", "plan_type": "monthly", "customer_name": "Ahmed Ali",
        "phone": "01012345678", "gender": "men", "notes": None,
        "payment_method": "online", "people": 1, "friends": False,
        "client_amount": 1,
    }
    value.update(overrides)
    return value


def create(client, key=None, **overrides):
    return client.post("/api/orders", json=payload(**overrides), headers={"Idempotency-Key": key or str(uuid.uuid4())})


def test_pages_health_assets_and_security_headers():
    with TestClient(app) as client:
        assert client.get("/").status_code == 200
        assert client.get("/join.html").status_code == 200
        assert client.get("/assets/img/icon-32.png").status_code == 200
        health = client.get("/api/health")
        assert health.json()["status"] == "ok"
        assert health.headers["x-content-type-options"] == "nosniff"


def test_server_pricing_validation_and_idempotency():
    with TestClient(app) as client:
        key = str(uuid.uuid4())
        first = create(client, key)
        assert first.status_code == 201
        assert first.json()["amount"] == 600  # expired offers are not applied; client_amount is ignored
        second = create(client, key)
        assert second.json()["id"] == first.json()["id"]
        invalid_phone = create(client, phone="019123")
        assert invalid_phone.status_code == 422


def test_mock_success_and_failure_are_persisted():
    with TestClient(app) as client:
        success = create(client).json()
        completed = client.get(f"/api/payments/mock/{success['id']}/complete?result=success", follow_redirects=False)
        assert completed.status_code == 303
        assert client.get(f"/api/orders/{success['id']}").json()["status"] == "paid"

        failure = create(client).json()
        client.get(f"/api/payments/mock/{failure['id']}/complete?result=failure", follow_redirects=False)
        assert client.get(f"/api/orders/{failure['id']}").json()["status"] == "payment_failed"


def test_signed_webhook_replay_protection_and_amount_check():
    with TestClient(app) as client:
        order = create(client).json()
        event = {"provider": "mock", "event_id": "evt-fixed", "order_id": order["id"],
                 "transaction_id": "tx-fixed", "amount": order["amount"], "currency": "EGP", "status": "paid"}
        raw = json.dumps(event, separators=(",", ":")).encode()
        signature = hmac.new(b"test-webhook-secret", raw, hashlib.sha256).hexdigest()
        headers = {"Content-Type": "application/json", "X-Cezar-Signature": signature}
        assert client.post("/api/payments/webhook", content=raw, headers=headers).status_code == 200
        assert client.post("/api/payments/webhook", content=raw, headers=headers).status_code == 200

        wrong = dict(event, event_id="evt-wrong", transaction_id="tx-wrong", amount=1)
        wrong_raw = json.dumps(wrong, separators=(",", ":")).encode()
        wrong_sig = hmac.new(b"test-webhook-secret", wrong_raw, hashlib.sha256).hexdigest()
        assert client.post("/api/payments/webhook", content=wrong_raw,
                           headers={"Content-Type": "application/json", "X-Cezar-Signature": wrong_sig}).status_code == 400


def test_admin_authentication():
    with TestClient(app) as client:
        assert client.get("/api/admin/orders").status_code == 401
        ok = client.get("/api/admin/orders", headers={"Authorization": "Bearer test-admin-token-long-enough"})
        assert ok.status_code == 200
