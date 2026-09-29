from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel


ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseModel):
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./cezar-local.db")
    public_base_url: str = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
    payment_mode: str = os.getenv("PAYMENT_MODE", "mock").lower()
    payment_webhook_secret: str = os.getenv("PAYMENT_WEBHOOK_SECRET", "local-development-only")
    admin_token: str = os.getenv("ADMIN_TOKEN", "local-admin-only")
    kashier_merchant_id: str | None = os.getenv("KASHIER_MERCHANT_ID")
    kashier_api_key: str | None = os.getenv("KASHIER_API_KEY")
    kashier_secret_key: str | None = os.getenv("KASHIER_SECRET_KEY")
    gym_api_mode: str = os.getenv("GYM_API_MODE", "disabled").lower()
    gym_api_base_url: str | None = os.getenv("GYM_API_BASE_URL")
    gym_api_key: str | None = os.getenv("GYM_API_KEY")
    environment: str = os.getenv("ENVIRONMENT", "development").lower()

    def validate_runtime(self) -> None:
        if self.payment_mode not in {"mock", "test", "live"}:
            raise RuntimeError("PAYMENT_MODE must be mock, test, or live")
        if self.gym_api_mode not in {"disabled", "http"}:
            raise RuntimeError("GYM_API_MODE must be disabled or http")
        if self.gym_api_mode == "http":
            if not self.gym_api_base_url or not self.gym_api_base_url.startswith("https://") or not self.gym_api_key:
                raise RuntimeError("Gym API requires an HTTPS base URL and server-side API key")
        if self.environment == "production":
            if self.database_url.startswith("sqlite"):
                raise RuntimeError("Production requires PostgreSQL DATABASE_URL")
            if not self.public_base_url.startswith("https://"):
                raise RuntimeError("Production requires an HTTPS PUBLIC_BASE_URL")
            if self.admin_token == "local-admin-only" or len(self.admin_token) < 24:
                raise RuntimeError("Production requires a strong ADMIN_TOKEN")
            if self.payment_webhook_secret == "local-development-only":
                raise RuntimeError("Production requires PAYMENT_WEBHOOK_SECRET")
        if self.payment_mode == "live":
            raise RuntimeError("Live payments are intentionally disabled until the gateway adapter is approved")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_runtime()
    return settings
