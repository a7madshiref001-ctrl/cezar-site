from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .models import AdminAuditLog, Attendance, Member, Membership, Order
from .security import require_admin


router = APIRouter()


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


@router.post("/api/member/login")
def member_login(payload: Login, db: Session = Depends(get_db)):
    member = db.scalar(select(Member).where(Member.phone == payload.phone))
    supplied = code_hash(payload.code)
    if not member or not hmac.compare_digest(member.access_code_hash, supplied):
        raise HTTPException(status_code=401, detail="رقم الهاتف أو رمز الدخول غير صحيح")
    return member_data(db, member, include_attendance=True)


@router.get("/api/admin/members", dependencies=[Depends(require_admin)])
def list_members(db: Session = Depends(get_db)):
    members = db.scalars(select(Member).order_by(Member.created_at.desc())).all()
    return [member_data(db, item, include_attendance=True) for item in members]


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
    db.add(AdminAuditLog(action="enroll_member", order_id=payload.order_id, detail=f"member={member.id}"))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="تعذر حفظ الاشتراك؛ راجع الطلب أو رقم الهاتف") from exc
    return {"member": member_data(db, member, include_attendance=True), "access_code": access_code}


@router.post("/api/admin/members/{member_id}/reset-code", dependencies=[Depends(require_admin)])
def reset_code(member_id: str, db: Session = Depends(get_db)):
    member = db.get(Member, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    code = new_code()
    member.access_code_hash = code_hash(code)
    db.add(AdminAuditLog(action="reset_member_code", detail=f"member={member_id}"))
    db.commit()
    return {"access_code": code}


@router.post("/api/admin/memberships/{membership_id}/checkins", status_code=201, dependencies=[Depends(require_admin)])
def check_in(membership_id: str, db: Session = Depends(get_db)):
    membership = db.scalar(select(Membership).where(Membership.id == membership_id).with_for_update())
    if not membership:
        raise HTTPException(status_code=404, detail="الاشتراك غير موجود")
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
