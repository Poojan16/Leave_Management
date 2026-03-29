from datetime import date, datetime
from math import ceil
from typing import Optional

from pydantic import BaseModel, field_validator, model_validator


# ── Request schemas ───────────────────────────────────────────────────────────

class LeaveApplyRequest(BaseModel):
    leave_type_id: int
    start_date: date
    end_date: date
    reason: str

    @field_validator("reason")
    @classmethod
    def reason_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Reason cannot be blank.")
        return v.strip()

    @model_validator(mode="after")
    def end_gte_start(self) -> "LeaveApplyRequest":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date.")
        return self


class CancelRequest(BaseModel):
    reason: Optional[str] = None


# ── Nested output schemas ─────────────────────────────────────────────────────

class LeaveTypeInfo(BaseModel):
    id: int
    name: str
    max_days_per_year: int

    model_config = {"from_attributes": True}


class UserBrief(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str
    employee_id: str

    model_config = {"from_attributes": True}


# ── LeaveOut ──────────────────────────────────────────────────────────────────

class LeaveOut(BaseModel):
    id: int
    user: UserBrief
    leave_type: LeaveTypeInfo
    start_date: date
    end_date: date
    days: int
    status: str
    reason: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── LeaveListOut ──────────────────────────────────────────────────────────────

class LeaveListOut(BaseModel):
    items: list[LeaveOut]
    total: int
    page: int
    pages: int


# ── BalanceOut ────────────────────────────────────────────────────────────────

class BalanceOut(BaseModel):
    leave_type: LeaveTypeInfo
    allocated: int
    carried_forward: int
    used: int
    remaining: int

    model_config = {"from_attributes": True}


# ── CalendarLeaveOut ──────────────────────────────────────────────────────────

class CalendarLeaveOut(BaseModel):
    id: int
    leave_type: LeaveTypeInfo
    start_date: date
    end_date: date
    days: int
    status: str

    model_config = {"from_attributes": True}
