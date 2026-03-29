from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator
from app.models.user import UserRole


class UserCreate(BaseModel):
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
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: Optional[UserRole] = None
    dept_id: Optional[int] = None
    manager_id: Optional[int] = None
    is_active: Optional[bool] = None


class UserOut(BaseModel):
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


class UserListOut(BaseModel):
    total: int
    items: list[UserOut]
