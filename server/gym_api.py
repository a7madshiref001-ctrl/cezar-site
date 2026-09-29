"""Vendor-neutral gym API boundary.

This is an explicit contract, not a claim that any particular gym product supports it.
Only the server talks to the gym system; the browser never receives its API key.
"""
from __future__ import annotations

from datetime import datetime
from urllib.parse import quote

import httpx
from pydantic import BaseModel, Field, ValidationError

from .config import get_settings


class GymAPIError(Exception):
    pass


class GymVisit(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    checked_in_at: datetime


class GymMembership(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    plan_name: str = Field(min_length=1, max_length=120)
    total_sessions: int = Field(ge=1, le=10000)
    used_sessions: int = Field(ge=0, le=10000)
    starts_at: datetime
    ends_at: datetime
    attendance: list[GymVisit] = Field(default_factory=list)


class GymDashboard(BaseModel):
    memberships: list[GymMembership] = Field(default_factory=list)


class GymCreatedMembership(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    member_id: str = Field(min_length=1, max_length=120)


class GymMember(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(pattern=r"^01[0125]\d{8}$")


class GymAPI:
    def __init__(self, client: httpx.Client | None = None):
        settings = get_settings()
        if settings.gym_api_mode != "http":
            raise GymAPIError("Gym API is not configured")
        self.base = settings.gym_api_base_url.rstrip("/")
        self.key = settings.gym_api_key
        self.client = client or httpx.Client(timeout=httpx.Timeout(5.0), follow_redirects=False)
        self.owns_client = client is None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        if self.owns_client:
            self.client.close()

    def _request(self, method: str, path: str, *, json: dict | None = None, idempotency_key: str | None = None) -> dict:
        headers = {"Authorization": f"Bearer {self.key}", "Accept": "application/json"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        try:
            response = self.client.request(method, self.base + path, headers=headers, json=json)
            response.raise_for_status()
            if len(response.content) > 1_000_000:
                raise GymAPIError("Gym API response is too large")
            data = response.json()
            if not isinstance(data, dict):
                raise GymAPIError("Gym API response is invalid")
            return data
        except (httpx.HTTPError, ValueError) as exc:
            raise GymAPIError("Gym API is temporarily unavailable or returned invalid data") from exc

    def dashboard(self, external_member_id: str) -> GymDashboard:
        path = f"/members/{quote(external_member_id, safe='')}/dashboard"
        try:
            result = GymDashboard.model_validate(self._request("GET", path))
        except ValidationError as exc:
            raise GymAPIError("Gym API dashboard does not match the agreed contract") from exc
        if any(item.used_sessions > item.total_sessions or item.ends_at <= item.starts_at for item in result.memberships):
            raise GymAPIError("Gym API returned inconsistent membership values")
        return result

    def member(self, external_member_id: str) -> GymMember:
        try:
            return GymMember.model_validate(self._request("GET", f"/members/{quote(external_member_id, safe='')}"))
        except ValidationError as exc:
            raise GymAPIError("Gym API member does not match the agreed contract") from exc

    def create_membership(self, *, membership_id: str, order_id: str | None, name: str, phone: str,
                          plan_name: str, total_sessions: int, starts_at: datetime, ends_at: datetime) -> GymCreatedMembership:
        payload = {
            "source": "cezar-web", "source_membership_id": membership_id, "source_order_id": order_id,
            "member": {"name": name, "phone": phone},
            "plan": {"name": plan_name, "total_sessions": total_sessions,
                     "starts_at": starts_at.isoformat(), "ends_at": ends_at.isoformat()},
        }
        try:
            return GymCreatedMembership.model_validate(
                self._request("POST", "/memberships", json=payload, idempotency_key=membership_id)
            )
        except ValidationError as exc:
            raise GymAPIError("Gym API subscription response does not match the agreed contract") from exc
