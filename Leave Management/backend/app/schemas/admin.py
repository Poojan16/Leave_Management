from datetime import date, datetime
from typing import Any, Optional, Union

from pydantic import BaseModel, EmailStr, field_validator

from app.models.user import UserRole


# ── User management ───────────────────────────────────────────────────────────

class UserCreateAdmin(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    employee_id: str
    password: str
    role: UserRole = UserRole.EMPLOYEE
    dept_id: Optional[int] = None
    manager_id: Optional[int] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit.")
        return v

    @field_validator("first_name", "last_name", "employee_id")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Field cannot be blank.")
        return v.strip()


class UserUpdateAdmin(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: Optional[UserRole] = None
    dept_id: Optional[int] = None
    manager_id: Optional[int] = None
    is_active: Optional[bool] = None


class UserAdminOut(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: EmailStr
    employee_id: str
    role: UserRole
    dept_id: Optional[int] = None
    manager_id: Optional[int] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserAdminListOut(BaseModel):
    items: list[UserAdminOut]
    total: int
    page: int
    pages: int


# ── Department management ─────────────────────────────────────────────────────

class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Department name cannot be blank.")
        return v.strip()


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class DepartmentOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Leave type management ─────────────────────────────────────────────────────

class LeaveTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    max_days_per_year: int = 0
    carry_forward: bool = False

    @field_validator("name")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Leave type name cannot be blank.")
        return v.strip()

    @field_validator("max_days_per_year")
    @classmethod
    def non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("max_days_per_year must be non-negative.")
        return v


class LeaveTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    max_days_per_year: Optional[int] = None
    carry_forward: Optional[bool] = None


class LeaveTypeOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    max_days_per_year: int
    carry_forward: bool

    model_config = {"from_attributes": True}


# ── Balance allocation ────────────────────────────────────────────────────────

class BalanceAllocateRequest(BaseModel):
    # Either a list of user IDs or the string "all"
    user_ids: Union[list[int], str]
    leave_type_id: int
    year: int
    days: int

    @field_validator("user_ids")
    @classmethod
    def validate_user_ids(cls, v: Union[list[int], str]) -> Union[list[int], str]:
        if isinstance(v, str) and v != "all":
            raise ValueError('user_ids must be a list of integers or the string "all".')
        return v

    @field_validator("days")
    @classmethod
    def positive_days(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("days must be a positive integer.")
        return v


class BalanceOut(BaseModel):
    id: int
    user_id: int
    leave_type_id: int
    year: int
    allocated: int
    used: int
    carried_forward: int
    remaining: int

    model_config = {"from_attributes": True}


class BalanceListOut(BaseModel):
    items: list[BalanceOut]
    total: int


# ── Audit logs ────────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: int
    actor_name: Optional[str] = None
    action: str
    entity: str
    entity_id: Optional[int] = None
    meta: Optional[dict[str, Any]] = None
    timestamp: datetime

    model_config = {"from_attributes": True}


class AuditLogListOut(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    pages: int


# ── Report filters ────────────────────────────────────────────────────────────

class ReportFilters(BaseModel):
    year: Optional[int] = None
    month: Optional[int] = None
    dept_id: Optional[int] = None
    employee_id: Optional[int] = None
    status: Optional[str] = None
    leave_type_id: Optional[int] = None


# ── Company-wide stats ────────────────────────────────────────────────────────

class CompanyStatsOut(BaseModel):
    year: int
    total_employees: int
    total_requests: int
    pending: int
    approved: int
    rejected: int
    cancelled: int
    total_days_taken: int
    by_department: list[dict[str, Any]]
    by_leave_type: list[dict[str, Any]]
    by_month: list[dict[str, Any]]
