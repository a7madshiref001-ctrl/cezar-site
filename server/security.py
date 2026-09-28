from __future__ import annotations

import hashlib
import hmac

from fastapi import Header, HTTPException

from .config import get_settings


def require_admin(authorization: str | None = Header(default=None)) -> None:
    expected = f"Bearer {get_settings().admin_token}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")


def valid_signature(body: bytes, signature: str | None) -> bool:
    if not signature:
        return False
    expected = hmac.new(get_settings().payment_webhook_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
