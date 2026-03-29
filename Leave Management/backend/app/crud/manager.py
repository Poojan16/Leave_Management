import calendar as cal_mod
from datetime import date, datetime, timedelta
from math import ceil
from typing import Optional

from sqlalchemy import and_, case, extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leave_approval import ApprovalAction, LeaveApproval
from app.models.leave_balance import LeaveBalance
from app.models.leave_request import LeaveRequest, LeaveStatus
from app.models.leave_type import LeaveType
from app.models.user import User
from app.schemas.manager import (
    CalendarDayEntry,
    LeaveTypeStatItem,
    ManagerStatsOut,
    MonthStatItem,
    TeamCalendarOut,
    TeamConflictOut,
    TeamLeaveOut,
)
from app.services.audit import AuditAction, AuditEntity, write_log


# ── Helpers ───────────────────────────────────────────────────────────────────

def _team_member_ids_subquery(manager_id: int):
    """Subquery returning IDs of all direct reports of the given manager."""
    return select(User.id).where(User.manager_id == manager_id).scalar_subquery()


def _build_team_leave_out(leave: LeaveRequest) -> TeamLeaveOut:
    dept_name = None
    if leave.user and leave.user.department:
        dept_name = leave.user.department.name
    return TeamLeaveOut(
        id=leave.id,
        user=leave.user,
        leave_type=leave.leave_type,
        start_date=leave.start_date,
        end_date=leave.end_date,
        days=leave.days,
        status=leave.status.value,
        reason=leave.reason,
        created_at=leave.created_at,
        employee_name=leave.user.full_name if leave.user else "",
        department_name=dept_name,
    )


# ── Reads ─────────────────────────────────────────────────────────────────────

async def get_team_leaves(
    db: AsyncSession,
    manager_id: int,
    status: Optional[LeaveStatus] = None,
    employee_id: Optional[str] = None,
    leave_type_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    search: Optional[str] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    skip: int = 0,
    limit: int = 20,
) -> tuple[list[TeamLeaveOut], int]:
    team_ids = _team_member_ids_subquery(manager_id)

    query = (
        select(LeaveRequest)
        .join(User, LeaveRequest.user_id == User.id)
        .where(LeaveRequest.user_id.in_(team_ids))
    )

    if status:
        query = query.where(LeaveRequest.status == status)
    if leave_type_id:
        query = query.where(LeaveRequest.leave_type_id == leave_type_id)
    if start_date:
        query = query.where(LeaveRequest.start_date >= start_date)
    if end_date:
        query = query.where(LeaveRequest.end_date <= end_date)
    if employee_id:
        query = query.where(User.employee_id == employee_id)
    if search:
        term = f"%{search.lower()}%"
        query = query.where(
            or_(
                func.lower(User.first_name).like(term),
                func.lower(User.last_name).like(term),
                func.lower(User.email).like(term),
            )
        )

    count_result = await db.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = count_result.scalar_one()

    sort_col = getattr(LeaveRequest, sort_by, LeaveRequest.created_at)
    order = sort_col.desc() if sort_dir == "desc" else sort_col.asc()
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    leaves = result.scalars().all()

    return [_build_team_leave_out(l) for l in leaves], total


async def get_manager_stats(
    db: AsyncSession, manager_id: int, year: int
) -> ManagerStatsOut:
    team_ids = _team_member_ids_subquery(manager_id)

    base = select(LeaveRequest).where(
        LeaveRequest.user_id.in_(team_ids),
        extract("year", LeaveRequest.created_at) == year,
    )

    # Per-status counts in one query
    counts_result = await db.execute(
        select(
            func.count().label("total"),
            func.sum(case((LeaveRequest.status == LeaveStatus.PENDING,   1), else_=0)).label("pending"),
            func.sum(case((LeaveRequest.status == LeaveStatus.APPROVED,  1), else_=0)).label("approved"),
            func.sum(case((LeaveRequest.status == LeaveStatus.REJECTED,  1), else_=0)).label("rejected"),
            func.sum(case((LeaveRequest.status == LeaveStatus.CANCELLED, 1), else_=0)).label("cancelled"),
        ).select_from(base.subquery())
    )
    row = counts_result.one()

    # By leave type
    type_result = await db.execute(
        select(LeaveType.name, func.count(LeaveRequest.id).label("cnt"))
        .join(LeaveRequest, LeaveRequest.leave_type_id == LeaveType.id)
        .where(
            LeaveRequest.user_id.in_(team_ids),
            extract("year", LeaveRequest.created_at) == year,
        )
        .group_by(LeaveType.name)
        .order_by(func.count(LeaveRequest.id).desc())
    )
    by_type = [
        LeaveTypeStatItem(leave_type=r.name, count=r.cnt)
        for r in type_result.all()
    ]

    # By month
    month_result = await db.execute(
        select(
            extract("month", LeaveRequest.created_at).label("month"),
            func.count(LeaveRequest.id).label("cnt"),
        )
        .where(
            LeaveRequest.user_id.in_(team_ids),
            extract("year", LeaveRequest.created_at) == year,
        )
        .group_by(extract("month", LeaveRequest.created_at))
        .order_by(extract("month", LeaveRequest.created_at))
    )
    by_month = [
        MonthStatItem(month=int(r.month), count=r.cnt)
        for r in month_result.all()
    ]

    return ManagerStatsOut(
        total_requests=row.total or 0,
        pending=row.pending or 0,
        approved=row.approved or 0,
        rejected=row.rejected or 0,
        cancelled=row.cancelled or 0,
        by_type=by_type,
        by_month=by_month,
    )


async def get_team_calendar(
    db: AsyncSession, manager_id: int, year: int, month: int
) -> list[TeamCalendarOut]:
    team_ids = _team_member_ids_subquery(manager_id)
    last_day = cal_mod.monthrange(year, month)[1]
    month_start = date(year, month, 1)
    month_end   = date(year, month, last_day)

    result = await db.execute(
        select(LeaveRequest)
        .join(User, LeaveRequest.user_id == User.id)
        .where(
            LeaveRequest.user_id.in_(team_ids),
            LeaveRequest.status.in_([LeaveStatus.PENDING, LeaveStatus.APPROVED]),
            LeaveRequest.start_date <= month_end,
            LeaveRequest.end_date   >= month_start,
        )
    )
    leaves = result.scalars().all()

    # Build a day → entries map
    day_map: dict[date, list[CalendarDayEntry]] = {}
    current = month_start
    while current <= month_end:
        day_map[current] = []
        current += timedelta(days=1)

    for leave in leaves:
        cur = max(leave.start_date, month_start)
        end = min(leave.end_date, month_end)
        while cur <= end:
            if cur in day_map:
                day_map[cur].append(
                    CalendarDayEntry(
                        user_name=leave.user.full_name if leave.user else "",
                        leave_type=leave.leave_type.name if leave.leave_type else "",
                        status=leave.status.value,
                    )
                )
            cur += timedelta(days=1)

    return [
        TeamCalendarOut(date=d, leaves_on_date=entries)
        for d, entries in sorted(day_map.items())
        if entries  # only return days that have leaves
    ]


async def check_team_conflicts(
    db: AsyncSession,
    manager_id: int,
    start_date: date,
    end_date: date,
) -> list[TeamConflictOut]:
    team_ids = _team_member_ids_subquery(manager_id)

    result = await db.execute(
        select(LeaveRequest)
        .join(User, LeaveRequest.user_id == User.id)
        .where(
            LeaveRequest.user_id.in_(team_ids),
            LeaveRequest.status.in_([LeaveStatus.PENDING, LeaveStatus.APPROVED]),
            LeaveRequest.start_date <= end_date,
            LeaveRequest.end_date   >= start_date,
        )
        .order_by(LeaveRequest.start_date)
    )
    leaves = result.scalars().all()

    return [
        TeamConflictOut(
            user_id=l.user_id,
            user_name=l.user.full_name if l.user else "",
            leave_type=l.leave_type.name if l.leave_type else "",
            start_date=l.start_date,
            end_date=l.end_date,
            days=l.days,
            status=l.status.value,
        )
        for l in leaves
    ]


# ── Writes ────────────────────────────────────────────────────────────────────

async def approve_leave(
    db: AsyncSession,
    leave: LeaveRequest,
    approver_id: int,
    remarks: Optional[str] = None,
) -> LeaveRequest:
    leave.status = LeaveStatus.APPROVED

    approval = LeaveApproval(
        request_id=leave.id,
        approver_id=approver_id,
        action=ApprovalAction.APPROVED,
        remarks=remarks,
    )
    db.add(approval)

    await write_log(
        db,
        user_id=approver_id,
        action=AuditAction.LEAVE_APPROVED,
        entity=AuditEntity.LEAVE_REQUEST,
        entity_id=leave.id,
        meta={"remarks": remarks, "employee_id": leave.user_id},
    )

    await db.flush()
    await db.refresh(leave)
    return leave


async def reject_leave(
    db: AsyncSession,
    leave: LeaveRequest,
    approver_id: int,
    remarks: str,
) -> LeaveRequest:
    leave.status = LeaveStatus.REJECTED

    approval = LeaveApproval(
        request_id=leave.id,
        approver_id=approver_id,
        action=ApprovalAction.REJECTED,
        remarks=remarks,
    )
    db.add(approval)

    # Restore balance — leave won't be taken
    year = leave.start_date.year
    balance_result = await db.execute(
        select(LeaveBalance).where(
            LeaveBalance.user_id == leave.user_id,
            LeaveBalance.leave_type_id == leave.leave_type_id,
            LeaveBalance.year == year,
        )
    )
    balance = balance_result.scalars().first()
    if balance:
        balance.used = max(0, balance.used - leave.days)

    await write_log(
        db,
        user_id=approver_id,
        action=AuditAction.LEAVE_REJECTED,
        entity=AuditEntity.LEAVE_REQUEST,
        entity_id=leave.id,
        meta={"remarks": remarks, "employee_id": leave.user_id, "days_restored": leave.days},
    )

    await db.flush()
    await db.refresh(leave)
    return leave
