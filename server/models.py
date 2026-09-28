from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), index=True, default="pending")
    provider: Mapped[str] = mapped_column(String(32), default="manual")
    provider_session_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    provider_transaction_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    plan_id: Mapped[str] = mapped_column(String(64))
    plan_type: Mapped[str] = mapped_column(String(32))
    amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="EGP")
    customer_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20), index=True)
    gender: Mapped[str] = mapped_column(String(12))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_method: Mapped[str] = mapped_column(String(32))
    people: Mapped[int] = mapped_column(Integer, default=1)
    raw_payment_event: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class WebhookEvent(Base):
    __tablename__ = "webhook_events"
    __table_args__ = (UniqueConstraint("provider", "event_id", name="uq_webhook_provider_event"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(32))
    event_id: Mapped[str] = mapped_column(String(255))
    payload: Mapped[str] = mapped_column(Text)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    order_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
