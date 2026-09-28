from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class OrderCreate(BaseModel):
    plan_id: str = Field(min_length=1, max_length=64)
    plan_type: str = Field(pattern=r"^(monthly|yearly|acts|single)$")
    customer_name: str = Field(min_length=3, max_length=120)
    phone: str
    gender: str = Field(pattern=r"^(men|women)$")
    notes: str | None = Field(default=None, max_length=1000)
    payment_method: str = Field(min_length=1, max_length=32)
    people: int = Field(default=1, ge=1, le=20)
    friends: bool = False
    client_amount: int | None = None

    @field_validator("customer_name")
    @classmethod
    def name_has_words(cls, value: str) -> str:
        clean = " ".join(value.split())
        if len(clean.split()) < 2:
            raise ValueError("full name is required")
        return clean

    @field_validator("phone")
    @classmethod
    def egyptian_phone(cls, value: str) -> str:
        clean = value.replace(" ", "").replace("-", "")
        import re
        if not re.fullmatch(r"01[0125]\d{8}", clean):
            raise ValueError("valid Egyptian mobile number required")
        return clean


class OrderOut(BaseModel):
    id: str
    status: str
    provider: str
    plan_id: str
    plan_type: str
    amount: int
    currency: str
    customer_name: str
    phone: str
    gender: str
    notes: str | None
    payment_method: str
    people: int
    created_at: datetime
    updated_at: datetime
    checkout_url: str | None = None

    model_config = {"from_attributes": True}


class MockResult(BaseModel):
    result: str = Field(pattern=r"^(success|failure)$")
