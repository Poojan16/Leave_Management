from datetime import date
from math import ceil
from typing import Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leave_balance import LeaveBalance
from app.models.leave_request import LeaveRequest, LeaveStatus
from app.models.leave_type import LeaveType
from app.schemas.leave import BalanceOut, CalendarLeaveOut, LeaveApplyRequest


# ── Helpers ───────────────────────────────────────────────────────────────────

def calculate_working_days(start: date, end: date) -> int:
    """Count calendar days between start and end inclusive, excluding weekends."""
    total = 0
    current = start
    from datetime import timedelta
    while current <= end:
        if current.weekday() < 5:   # Mon–Fri
            total += 1
        current += timedelta(days=1)
    return max(total, 1)


# ── Reads ─────────────────────────────────────────────────────────────────────

async def get_leave_by_id(
    db: AsyncSession, leave_id: int
) -> Optional[LeaveRequest]:
    result = await db.execute(
        select(LeaveRequest).where(LeaveRequest.id == leave_id)
    )
    return result.scalars().first()


async def get_user_leaves(
    db: AsyncSession,
    user_id: int,
    status: Optional[LeaveStatus] = None,
    leave_type_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    skip: int = 0,
    limit: int = 20,
) -> tuple[list[LeaveRequest], int]:
    query = select(LeaveRequest).where(LeaveRequest.user_id == user_id)

    if status:
        query = query.where(LeaveRequest.status == status)
    if leave_type_id:
        query = query.where(LeaveRequest.leave_type_id == leave_type_id)
    if start_date:
        query = query.where(LeaveRequest.start_date >= start_date)
    if end_date:
        query = query.where(LeaveRequest.end_date <= end_date)

    count_result = await db.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = count_result.scalar_one()

    # Dynamic sort
    sort_col = getattr(LeaveRequest, sort_by, LeaveRequest.created_at)
    order = sort_col.desc() if sort_dir == "desc" else sort_col.asc()
    query = query.order_by(order).offset(skip).limit(limit)

    result = await db.execute(query)
    return result.scalars().all(), total


async def check_overlap(
    db: AsyncSession,
    user_id: int,
    start_date: date,
    end_date: date,
    exclude_id: Optional[int] = None,
) -> bool:
    """Return True if an active (pending/approved) leave overlaps the given range."""
    query = select(LeaveRequest).where(
        LeaveRequest.user_id == user_id,
        LeaveRequest.status.in_([LeaveStatus.PENDING, LeaveStatus.APPROVED]),
        or_(
            and_(LeaveRequest.start_date <= start_date, start_date <= LeaveRequest.end_date),
            and_(LeaveRequest.start_date <= end_date,   end_date   <= LeaveRequest.end_date),
            and_(start_date <= LeaveRequest.start_date, LeaveRequest.end_date <= end_date),
        ),
    )
    if exclude_id is not None:
        query = query.where(LeaveRequest.id != exclude_id)

    result = await db.execute(query)
    return result.scalars().first() is not None


async def get_balance(
    db: AsyncSession, user_id: int, year: int
) -> list[BalanceOut]:
    result = await db.execute(
        select(LeaveBalance)
        .where(LeaveBalance.user_id == user_id, LeaveBalance.year == year)
    )
    balances = result.scalars().all()
    return [
        BalanceOut(
            leave_type=b.leave_type,
            allocated=b.allocated,
            carried_forward=b.carried_forward,
            used=b.used,
            remaining=b.remaining,
        )
        for b in balances
    ]


async def get_calendar_leaves(
    db: AsyncSession, user_id: int, year: int, month: int
) -> list[LeaveRequest]:
    from datetime import date as date_cls
    import calendar as cal_mod

    last_day = cal_mod.monthrange(year, month)[1]
    month_start = date_cls(year, month, 1)
    month_end   = date_cls(year, month, last_day)

    result = await db.execute(
        select(LeaveRequest).where(
            LeaveRequest.user_id == user_id,
            LeaveRequest.status.in_([LeaveStatus.PENDING, LeaveStatus.APPROVED]),
            LeaveRequest.start_date <= month_end,
            LeaveRequest.end_date   >= month_start,
        )
    )
    return result.scalars().all()


# ── Writes ────────────────────────────────────────────────────────────────────

async def create_leave(
    db: AsyncSession, user_id: int, schema: LeaveApplyRequest
) -> LeaveRequest:
    days = calculate_working_days(schema.start_date, schema.end_date)
    leave = LeaveRequest(
        user_id=user_id,
        leave_type_id=schema.leave_type_id,
        start_date=schema.start_date,
        end_date=schema.end_date,
        days=days,
        reason=schema.reason,
        status=LeaveStatus.PENDING,
    )
    db.add(leave)
    await db.flush()
    await db.refresh(leave)
    return leave


async def cancel_leave(
    db: AsyncSession, leave: LeaveRequest, reason: Optional[str] = None
) -> LeaveRequest:
    leave.status = LeaveStatus.CANCELLED
    if reason:
        leave.reason = f"{leave.reason} [Cancelled: {reason.strip()}]"
    await db.flush()
    await db.refresh(leave)
    return leave


async def deduct_balance(
    db: AsyncSession, user_id: int, leave_type_id: int, days: int, year: int
) -> LeaveBalance:
    result = await db.execute(
        select(LeaveBalance).where(
            LeaveBalance.user_id == user_id,
            LeaveBalance.leave_type_id == leave_type_id,
            LeaveBalance.year == year,
        )
    )
    balance = result.scalars().first()
    if balance is None:
        raise ValueError("No leave balance record found for this leave type and year.")
    if balance.remaining < days:
        raise ValueError(
            f"Insufficient balance. Requested {days} day(s), "
            f"available {balance.remaining}."
        )
    balance.used += days
    await db.flush()
    await db.refresh(balance)
    return balance


async def restore_balance(
    db: AsyncSession, user_id: int, leave_type_id: int, days: int, year: int
) -> LeaveBalance:
    result = await db.execute(
        select(LeaveBalance).where(
            LeaveBalance.user_id == user_id,
            LeaveBalance.leave_type_id == leave_type_id,
            LeaveBalance.year == year,
        )
    )
    balance = result.scalars().first()
    if balance is None:
        raise ValueError("No leave balance record found.")
    balance.used = max(0, balance.used - days)
    await db.flush()
    await db.refresh(balance)
    return balance
