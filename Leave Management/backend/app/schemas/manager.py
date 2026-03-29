from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator

from app.schemas.leave import LeaveOut, LeaveTypeInfo, UserBrief


# ── Request schemas ───────────────────────────────────────────────────────────

class ApproveRequest(BaseModel):
    remarks: Optional[str] = None


class RejectRequest(BaseModel):
    remarks: str

    @field_validator("remarks")
    @classmethod
    def remarks_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Remarks are required when rejecting a leave request.")
        return v.strip()


# ── Team leave output ─────────────────────────────────────────────────────────

class TeamLeaveOut(LeaveOut):
    employee_name: str
    department_name: Optional[str] = None

    model_config = {"from_attributes": True}


class TeamLeaveListOut(BaseModel):
    items: list[TeamLeaveOut]
    total: int
    page: int
    pages: int


# ── Stats output ──────────────────────────────────────────────────────────────

class LeaveTypeStatItem(BaseModel):
    leave_type: str
    count: int


class MonthStatItem(BaseModel):
    month: int
    count: int


class ManagerStatsOut(BaseModel):
    total_requests: int
    pending: int
    approved: int
    rejected: int
    cancelled: int
    by_type: list[LeaveTypeStatItem]
    by_month: list[MonthStatItem]


# ── Team calendar output ──────────────────────────────────────────────────────

class CalendarDayEntry(BaseModel):
    user_name: str
    leave_type: str
    status: str


class TeamCalendarOut(BaseModel):
    date: date
    leaves_on_date: list[CalendarDayEntry]


# ── Team conflict output ──────────────────────────────────────────────────────

class TeamConflictOut(BaseModel):
    user_id: int
    user_name: str
    leave_type: str
    start_date: date
    end_date: date
    days: int
    status: str
