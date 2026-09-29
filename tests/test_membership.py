from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from server.app import app


ADMIN = {"Authorization": "Bearer test-admin-token-long-enough"}


def enrollment(**overrides):
    start = datetime.now(timezone.utc) - timedelta(days=1)
    data = {
        "name": "Member Example", "phone": "01011112222", "plan_name": "باور",
        "total_sessions": 2, "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(days=30)).isoformat(),
    }
    data.update(overrides)
    return data


def test_member_login_attendance_and_reset():
    with TestClient(app) as client:
        assert client.get('/api/admin/members').status_code == 401
        created = client.post('/api/admin/memberships', json=enrollment(), headers=ADMIN)
        assert created.status_code == 201
        member = created.json()['member']
        code = created.json()['access_code']
        assert len(code) >= 16
        login = {"phone": member['phone'], "code": code}
        assert client.post('/api/member/login', json={**login, "code": "wrong-but-long-enough"}).status_code == 401
        assert client.post('/api/member/login', json=login).json()['memberships'][0]['remaining_sessions'] == 2

        membership_id = member['memberships'][0]['id']
        assert client.post(f'/api/admin/memberships/{membership_id}/checkins').status_code == 401
        first = client.post(f'/api/admin/memberships/{membership_id}/checkins', headers=ADMIN)
        assert first.status_code == 201
        assert first.json()['remaining_sessions'] == 1
        attendance_id = first.json()['attendance'][0]['id']
        assert client.post(f'/api/admin/attendance/{attendance_id}/void', headers=ADMIN).json()['remaining_sessions'] == 2
        assert client.post(f'/api/admin/attendance/{attendance_id}/void', headers=ADMIN).status_code == 409
        client.post(f'/api/admin/memberships/{membership_id}/checkins', headers=ADMIN)
        client.post(f'/api/admin/memberships/{membership_id}/checkins', headers=ADMIN)
        assert client.post(f'/api/admin/memberships/{membership_id}/checkins', headers=ADMIN).status_code == 409

        reset = client.post(f"/api/admin/members/{member['id']}/reset-code", headers=ADMIN).json()['access_code']
        assert client.post('/api/member/login', json=login).status_code == 401
        assert client.post('/api/member/login', json={**login, "code": reset}).status_code == 200


def test_order_can_be_activated_only_once_and_phone_must_match():
    with TestClient(app) as client:
        order = client.post('/api/orders', headers={'Idempotency-Key':str(uuid4())}, json={
            'plan_id':'power','plan_type':'monthly','customer_name':'Another Member',
            'phone':'01122223333','gender':'men','payment_method':'cash'
        }).json()
        data = enrollment(order_id=order['id'], name=order['customer_name'], phone=order['phone'])
        assert client.post('/api/admin/memberships', json={**data,'phone':'01011112222'}, headers=ADMIN).status_code == 422
        assert client.post('/api/admin/memberships', json=data, headers=ADMIN).status_code == 201
        assert client.post('/api/admin/memberships', json=data, headers=ADMIN).status_code == 409


def test_expired_membership_rejects_checkin():
    with TestClient(app) as client:
        old = datetime.now(timezone.utc) - timedelta(days=35)
        data = enrollment(phone='01211112222', starts_at=old.isoformat(), ends_at=(old+timedelta(days=30)).isoformat())
        result = client.post('/api/admin/memberships', json=data, headers=ADMIN).json()
        membership = result['member']['memberships'][0]
        assert membership['status'] == 'expired'
        assert client.post(f"/api/admin/memberships/{membership['id']}/checkins", headers=ADMIN).status_code == 409
