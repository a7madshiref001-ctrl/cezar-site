from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
from fastapi.testclient import TestClient

from server.app import app
from server.config import get_settings
from server.gym_api import GymAPI
from server import membership as member_routes


ADMIN = {"Authorization": "Bearer test-admin-token-long-enough"}


def plan(phone: str) -> dict:
    start = datetime.now(timezone.utc) - timedelta(days=1)
    return {"name": "Test Member", "phone": phone, "plan_name": "جولد", "total_sessions": 12,
            "starts_at": start.isoformat(), "ends_at": (start + timedelta(days=30)).isoformat()}


def test_cookie_session_is_private_revocable_and_rate_limited():
    with TestClient(app) as client:
        assert client.get("/api/member/me").status_code == 401
        response = client.post("/api/admin/memberships", json=plan("01088887777"), headers=ADMIN)
        code = response.json()["access_code"]
        for _ in range(5):
            assert client.post("/api/member/login", json={"phone":"01088887777", "code":"wrong-code-long-enough"}).status_code == 401
        assert client.post("/api/member/login", json={"phone":"01088887777", "code":code}).status_code == 429
        # Another test client has a separate IP in production; here reset only the test throttle window.
        from server.db import SessionLocal
        from server.models import LoginThrottle
        with SessionLocal() as db:
            for throttle in db.query(LoginThrottle).all():
                db.delete(throttle)
            db.commit()
        login = client.post("/api/member/login", json={"phone":"01088887777", "code":code})
        assert login.status_code == 200
        assert login.json()["source"] == "local"
        assert "httponly" in login.headers["set-cookie"].lower()
        assert "samesite=strict" in login.headers["set-cookie"].lower()
        assert login.headers["cache-control"] == "no-store"
        assert client.get("/api/member/me").status_code == 200
        assert client.post("/api/member/logout").status_code == 200
        assert client.get("/api/member/me").status_code == 401
        new_login = client.post("/api/member/login", json={"phone":"01088887777", "code":code})
        assert new_login.status_code == 200
        member_id = response.json()["member"]["id"]
        assert client.post(f"/api/admin/members/{member_id}/reset-code", headers=ADMIN).status_code == 200
        assert client.get("/api/member/me").status_code == 401
        page = client.get("/member.html")
        assert "script-src 'self'" in page.headers["content-security-policy"]


def test_gym_import_live_read_cached_fallback_and_outbound_dispatch(monkeypatch):
    settings = get_settings()
    old = (settings.gym_api_mode, settings.gym_api_base_url, settings.gym_api_key)
    settings.gym_api_mode = "http"
    settings.gym_api_base_url = "https://gym.example"
    settings.gym_api_key = "test-gym-secret"
    requests = []
    remote_down = False
    start = datetime.now(timezone.utc) - timedelta(days=1)

    def fake(request: httpx.Request) -> httpx.Response:
        nonlocal remote_down
        requests.append(request)
        assert request.headers["authorization"] == "Bearer test-gym-secret"
        if remote_down:
            return httpx.Response(503)
        if request.method == "GET" and request.url.path == "/members/gym-9":
            return httpx.Response(200, json={"id":"gym-9", "name":"External Member", "phone":"01199998888"})
        if request.method == "GET" and request.url.path == "/members/gym-9/dashboard":
            return httpx.Response(200, json={"memberships":[{
                "id":"external-plan-1", "plan_name":"جولد من السيستم", "total_sessions":24,
                "used_sessions":6, "starts_at":start.isoformat(),
                "ends_at":(start+timedelta(days=30)).isoformat(),
                "attendance":[{"id":"visit-1", "checked_in_at":start.isoformat()}],
            }]})
        if request.method == "POST" and request.url.path == "/memberships":
            assert request.headers["idempotency-key"]
            assert b"cezar-web" in request.content
            return httpx.Response(201, json={"id":"external-plan-2", "member_id":"gym-9"})
        return httpx.Response(404)

    external_client = httpx.Client(transport=httpx.MockTransport(fake))
    monkeypatch.setattr(member_routes, "GymAPI", lambda: GymAPI(client=external_client))
    try:
        with TestClient(app) as client:
            assert client.post("/api/admin/gym/import-member", json={"name":"External Member", "phone":"01099998888", "external_member_id":"gym-9"}, headers=ADMIN).status_code == 422
            imported = client.post("/api/admin/gym/import-member", json={"name":"External Member", "phone":"01199998888", "external_member_id":"gym-9"}, headers=ADMIN)
            assert imported.status_code == 201
            code = imported.json()["access_code"]
            assert client.post("/api/member/login", json={"phone":"01199998888", "code":code}).json()["source"] == "gym"
            live = client.get("/api/member/me").json()
            assert live["memberships"][0]["remaining_sessions"] == 18
            remote_down = True
            stale = client.get("/api/member/me").json()
            assert stale["source"] == "cached"
            assert stale["memberships"][0]["remaining_sessions"] == 18
            remote_down = False
            created = client.post("/api/admin/memberships", json=plan("01199998888"), headers=ADMIN)
            assert created.status_code == 201
            assert created.json()["gym_sync_status"] == "sent"
            membership_id = created.json()["member"]["memberships"][0]["id"]
            assert client.post(f"/api/admin/memberships/{membership_id}/checkins", headers=ADMIN).status_code == 409
            assert client.post(f"/api/admin/gym/retry/{membership_id}", headers=ADMIN).json()["status"] == "sent"
            assert sum(r.method == "POST" and r.url.path == "/memberships" for r in requests) == 1
    finally:
        external_client.close()
        settings.gym_api_mode, settings.gym_api_base_url, settings.gym_api_key = old


def test_existing_member_can_be_linked_without_changing_their_code(monkeypatch):
    settings = get_settings()
    old = (settings.gym_api_mode, settings.gym_api_base_url, settings.gym_api_key)
    with TestClient(app) as client:
        created = client.post("/api/admin/memberships", json=plan("01299997777"), headers=ADMIN).json()
        code = created["access_code"]
    settings.gym_api_mode, settings.gym_api_base_url, settings.gym_api_key = "http", "https://gym.example", "test-gym-secret"

    def fake(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/members/gym-existing":
            return httpx.Response(200, json={"id":"gym-existing", "name":"Existing Member", "phone":"01299997777"})
        if request.url.path == "/members/gym-existing/dashboard":
            return httpx.Response(200, json={"memberships":[]})
        return httpx.Response(404)

    external_client = httpx.Client(transport=httpx.MockTransport(fake))
    monkeypatch.setattr(member_routes, "GymAPI", lambda: GymAPI(client=external_client))
    try:
        with TestClient(app) as client:
            imported = client.post("/api/admin/gym/import-member", json={
                "name":"Existing Member", "phone":"01299997777", "external_member_id":"gym-existing"
            }, headers=ADMIN)
            assert imported.status_code == 201
            assert imported.json()["linked_existing"] is True
            assert imported.json()["access_code"] is None
            logged_in = client.post("/api/member/login", json={"phone":"01299997777", "code":code})
            assert logged_in.status_code == 200
            assert logged_in.json()["source"] == "gym"
    finally:
        external_client.close()
        settings.gym_api_mode, settings.gym_api_base_url, settings.gym_api_key = old


def test_failed_outbound_send_can_retry_with_same_idempotency_key(monkeypatch):
    settings = get_settings()
    old = (settings.gym_api_mode, settings.gym_api_base_url, settings.gym_api_key)
    settings.gym_api_mode, settings.gym_api_base_url, settings.gym_api_key = "http", "https://gym.example", "test-gym-secret"
    allow = False
    keys = []

    def fake(request: httpx.Request) -> httpx.Response:
        nonlocal allow
        if request.method == "POST" and request.url.path == "/memberships":
            keys.append(request.headers["idempotency-key"])
            return httpx.Response(201, json={"id":"gym-plan-retry", "member_id":"gym-retry"}) if allow else httpx.Response(503)
        if request.url.path == "/members/gym-retry":
            return httpx.Response(200, json={"id":"gym-retry", "name":"Retry Member", "phone":"01599997777"})
        return httpx.Response(404)

    external_client = httpx.Client(transport=httpx.MockTransport(fake))
    monkeypatch.setattr(member_routes, "GymAPI", lambda: GymAPI(client=external_client))
    try:
        with TestClient(app) as client:
            created = client.post("/api/admin/memberships", json=plan("01599997777"), headers=ADMIN)
            assert created.status_code == 201
            assert created.json()["gym_sync_status"] == "error"
            membership_id = created.json()["member"]["memberships"][0]["id"]
            allow = True
            retried = client.post(f"/api/admin/gym/retry/{membership_id}", headers=ADMIN)
            assert retried.json()["status"] == "sent"
            assert keys == [membership_id, membership_id]
            assert client.get("/api/admin/gym/status", headers=ADMIN).json()["sent"] >= 1
    finally:
        external_client.close()
        settings.gym_api_mode, settings.gym_api_base_url, settings.gym_api_key = old
