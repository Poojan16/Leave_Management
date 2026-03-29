from datetime import date
from math import ceil
from typing import Any, Optional, Union

from sqlalchemy import and_, case, extract, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.department import Department
from app.models.leave_approval import LeaveApproval
from app.models.leave_balance import LeaveBalance
from app.models.leave_request import LeaveRequest, LeaveStatus
from app.models.leave_type import LeaveType
from app.models.user import User, UserRole
from app.schemas.admin import (
    BalanceAllocateRequest,
    DepartmentCreate,
    DepartmentUpdate,
    LeaveTypeCreate,
    LeaveTypeUpdate,
    UserCreateAdmin,
    UserUpdateAdmin,
)


# ── User CRUD ─────────────────────────────────────────────────────────────────

async def admin_list_users(
    db: AsyncSession,
    search: Optional[str] = None,
    role: Optional[UserRole] = None,
    dept_id: Optional[int] = None,
    is_active: Optional[bool] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[User], int]:
    query = select(User)

    if search:
        term = f"%{search.lower()}%"
        query = query.where(
            or_(
                func.lower(User.first_name).like(term),
                func.lower(User.last_name).like(term),
                func.lower(User.email).like(term),
                func.lower(User.employee_id).like(term),
            )
        )
    if role is not None:
        query = query.where(User.role == role)
    if dept_id is not None:
        query = query.where(User.dept_id == dept_id)
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    result = await db.execute(query.order_by(User.id).offset(skip).limit(limit))
    return result.scalars().all(), total


async def admin_create_user(db: AsyncSession, schema: UserCreateAdmin) -> User:
    user = User(
        first_name=schema.first_name,
        last_name=schema.last_name,
        email=schema.email,
        employee_id=schema.employee_id,
        hashed_password=hash_password(schema.password),
        role=schema.role,
        dept_id=schema.dept_id,
        manager_id=schema.manager_id,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def admin_get_user(db: AsyncSession, user_id: int) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalars().first()


async def admin_update_user(
    db: AsyncSession, user: User, schema: UserUpdateAdmin
) -> User:
    for field, value in schema.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.flush()
    await db.refresh(user)
    return user


async def admin_deactivate_user(db: AsyncSession, user: User) -> User:
    user.is_active = False
    await db.flush()
    await db.refresh(user)
    return user


# ── Department CRUD ───────────────────────────────────────────────────────────

async def list_departments(db: AsyncSession) -> list[Department]:
    result = await db.execute(select(Department).order_by(Department.name))
    return result.scalars().all()


async def get_department(db: AsyncSession, dept_id: int) -> Optional[Department]:
    result = await db.execute(select(Department).where(Department.id == dept_id))
    return result.scalars().first()


async def create_department(db: AsyncSession, schema: DepartmentCreate) -> Department:
    dept = Department(name=schema.name, description=schema.description)
    db.add(dept)
    await db.flush()
    await db.refresh(dept)
    return dept


async def update_department(
    db: AsyncSession, dept: Department, schema: DepartmentUpdate
) -> Department:
    for field, value in schema.model_dump(exclude_unset=True).items():
        setattr(dept, field, value)
    await db.flush()
    await db.refresh(dept)
    return dept


async def delete_department(db: AsyncSession, dept: Department) -> None:
    await db.delete(dept)
    await db.flush()


# ── Leave type CRUD ───────────────────────────────────────────────────────────

async def list_leave_types(db: AsyncSession) -> list[LeaveType]:
    result = await db.execute(select(LeaveType).order_by(LeaveType.name))
    return result.scalars().all()


async def get_leave_type(db: AsyncSession, lt_id: int) -> Optional[LeaveType]:
    result = await db.execute(select(LeaveType).where(LeaveType.id == lt_id))
    return result.scalars().first()


async def create_leave_type(db: AsyncSession, schema: LeaveTypeCreate) -> LeaveType:
    lt = LeaveType(
        name=schema.name,
        description=schema.description,
        max_days_per_year=schema.max_days_per_year,
        carry_forward=schema.carry_forward,
    )
    db.add(lt)
    await db.flush()
    await db.refresh(lt)
    return lt


async def update_leave_type(
    db: AsyncSession, lt: LeaveType, schema: LeaveTypeUpdate
) -> LeaveType:
    for field, value in schema.model_dump(exclude_unset=True).items():
        setattr(lt, field, value)
    await db.flush()
    await db.refresh(lt)
    return lt


async def delete_leave_type(db: AsyncSession, lt: LeaveType) -> None:
    await db.delete(lt)
    await db.flush()


# ── Balance management ────────────────────────────────────────────────────────

async def get_balances(
    db: AsyncSession,
    user_id: Optional[int] = None,
    year: Optional[int] = None,
) -> list[LeaveBalance]:
    query = select(LeaveBalance)
    if user_id is not None:
        query = query.where(LeaveBalance.user_id == user_id)
    if year is not None:
        query = query.where(LeaveBalance.year == year)
    result = await db.execute(query.order_by(LeaveBalance.user_id, LeaveBalance.leave_type_id))
    return result.scalars().all()


async def allocate_balances(
    db: AsyncSession,
    schema: BalanceAllocateRequest,
) -> int:
    """
    Bulk upsert leave balances.
    If user_ids == "all", applies to every active user.
    Returns the number of records upserted.
    """
    if schema.user_ids == "all":
        result = await db.execute(select(User.id).where(User.is_active == True))
        user_ids: list[int] = list(result.scalars().all())
    else:
        user_ids = schema.user_ids  # type: ignore[assignment]

    if not user_ids:
        return 0

    count = 0
    for uid in user_ids:
        # Check if record exists
        existing = await db.execute(
            select(LeaveBalance).where(
                LeaveBalance.user_id == uid,
                LeaveBalance.leave_type_id == schema.leave_type_id,
                LeaveBalance.year == schema.year,
            )
        )
        balance = existing.scalars().first()
        if balance:
            balance.allocated = schema.days
        else:
            balance = LeaveBalance(
                user_id=uid,
                leave_type_id=schema.leave_type_id,
                year=schema.year,
                allocated=schema.days,
                used=0,
                carried_forward=0,
            )
            db.add(balance)
        count += 1

    await db.flush()
    return count


# ── Audit logs ────────────────────────────────────────────────────────────────

async def get_audit_logs(
    db: AsyncSession,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    entity: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[AuditLog], int]:
    query = select(AuditLog)

    if user_id is not None:
        query = query.where(AuditLog.user_id == user_id)
    if action:
        query = query.where(AuditLog.action == action)
    if entity:
        query = query.where(AuditLog.entity == entity)
    if start_date:
        query = query.where(AuditLog.timestamp >= start_date)
    if end_date:
        from datetime import datetime, time
        end_dt = datetime.combine(end_date, time.max)
        query = query.where(AuditLog.timestamp <= end_dt)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    result = await db.execute(
        query.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit)
    )
    return result.scalars().all(), total


# ── Report data ───────────────────────────────────────────────────────────────

async def get_report_data(
    db: AsyncSession,
    year: Optional[int] = None,
    month: Optional[int] = None,
    dept_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    status: Optional[str] = None,
    leave_type_id: Optional[int] = None,
) -> list[dict[str, Any]]:
    query = (
        select(LeaveRequest)
        .join(User, LeaveRequest.user_id == User.id)
        .join(LeaveType, LeaveRequest.leave_type_id == LeaveType.id)
    )

    if year:
        query = query.where(extract("year", LeaveRequest.start_date) == year)
    if month:
        query = query.where(extract("month", LeaveRequest.start_date) == month)
    if dept_id:
        query = query.where(User.dept_id == dept_id)
    if employee_id:
        query = query.where(LeaveRequest.user_id == employee_id)
    if status:
        query = query.where(LeaveRequest.status == status)
    if leave_type_id:
        query = query.where(LeaveRequest.leave_type_id == leave_type_id)

    result = await db.execute(query.order_by(LeaveRequest.start_date))
    leaves = result.scalars().all()

    rows = []
    for leave in leaves:
        # Resolve approver name from latest approval record
        approved_by = ""
        if leave.approvals:
            latest = sorted(leave.approvals, key=lambda a: a.actioned_at, reverse=True)[0]
            if latest.approver:
                approved_by = latest.approver.full_name

        dept_name = ""
        if leave.user and leave.user.department:
            dept_name = leave.user.department.name

        rows.append({
            "employee": leave.user.full_name if leave.user else "",
            "employee_id": leave.user.employee_id if leave.user else "",
            "department": dept_name,
            "leave_type": leave.leave_type.name if leave.leave_type else "",
            "start_date": str(leave.start_date),
            "end_date": str(leave.end_date),
            "days": leave.days,
            "status": leave.status.value,
            "reason": leave.reason,
            "approved_by": approved_by,
            "created_at": str(leave.created_at.date()) if leave.created_at else "",
        })
    return rows


# ── Company-wide stats ────────────────────────────────────────────────────────

async def get_company_stats(db: AsyncSession, year: int) -> dict[str, Any]:
    # Total active employees
    emp_result = await db.execute(
        select(func.count(User.id)).where(User.is_active == True)
    )
    total_employees = emp_result.scalar_one()

    # Status counts + total days
    stats_result = await db.execute(
        select(
            func.count(LeaveRequest.id).label("total"),
            func.sum(case((LeaveRequest.status == LeaveStatus.PENDING,   1), else_=0)).label("pending"),
            func.sum(case((LeaveRequest.status == LeaveStatus.APPROVED,  1), else_=0)).label("approved"),
            func.sum(case((LeaveRequest.status == LeaveStatus.REJECTED,  1), else_=0)).label("rejected"),
            func.sum(case((LeaveRequest.status == LeaveStatus.CANCELLED, 1), else_=0)).label("cancelled"),
            func.sum(
                case((LeaveRequest.status == LeaveStatus.APPROVED, LeaveRequest.days), else_=0)
            ).label("total_days"),
        ).where(extract("year", LeaveRequest.start_date) == year)
    )
    s = stats_result.one()

    # By department
    dept_result = await db.execute(
        select(Department.name, func.count(LeaveRequest.id).label("cnt"))
        .join(User, User.dept_id == Department.id)
        .join(LeaveRequest, LeaveRequest.user_id == User.id)
        .where(extract("year", LeaveRequest.start_date) == year)
        .group_by(Department.name)
        .order_by(func.count(LeaveRequest.id).desc())
    )
    by_dept = [{"department": r.name, "count": r.cnt} for r in dept_result.all()]

    # By leave type
    type_result = await db.execute(
        select(LeaveType.name, func.count(LeaveRequest.id).label("cnt"))
        .join(LeaveRequest, LeaveRequest.leave_type_id == LeaveType.id)
        .where(extract("year", LeaveRequest.start_date) == year)
        .group_by(LeaveType.name)
        .order_by(func.count(LeaveRequest.id).desc())
    )
    by_type = [{"leave_type": r.name, "count": r.cnt} for r in type_result.all()]

    # By month
    month_result = await db.execute(
        select(
            extract("month", LeaveRequest.start_date).label("month"),
            func.count(LeaveRequest.id).label("cnt"),
        )
        .where(extract("year", LeaveRequest.start_date) == year)
        .group_by(extract("month", LeaveRequest.start_date))
        .order_by(extract("month", LeaveRequest.start_date))
    )
    by_month = [{"month": int(r.month), "count": r.cnt} for r in month_result.all()]

    return {
        "year": year,
        "total_employees": total_employees,
        "total_requests": s.total or 0,
        "pending": s.pending or 0,
        "approved": s.approved or 0,
        "rejected": s.rejected or 0,
        "cancelled": s.cancelled or 0,
        "total_days_taken": s.total_days or 0,
        "by_department": by_dept,
        "by_leave_type": by_type,
        "by_month": by_month,
    }
