import logging
from datetime import date
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_user, get_db
from app.crud.leave import (
    calculate_working_days,
    cancel_leave,
    check_overlap,
    create_leave,
    deduct_balance,
    get_balance,
    get_calendar_leaves,
    get_leave_by_id,
    get_user_leaves,
    restore_balance,
)
from app.models.leave_request import LeaveStatus
from app.models.user import User, UserRole
from app.schemas.leave import (
    BalanceOut,
    CalendarLeaveOut,
    CancelRequest,
    LeaveApplyRequest,
    LeaveListOut,
    LeaveOut,
)
from app.services.audit import AuditAction, AuditEntity, write_log
from app.services.email import (
    send_leave_applied_email,
    send_leave_cancelled_email,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leaves", tags=["Leaves"])


# ── POST /leaves/apply ────────────────────────────────────────────────────────

@router.post("/apply", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
async def apply_leave(
    body: LeaveApplyRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply for leave. Validates overlap and balance before creating."""
    year = body.start_date.year

    # 1. Overlap check
    if await check_overlap(db, current_user.id, body.start_date, body.end_date):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a pending or approved leave overlapping these dates.",
        )

    # 2. Working days
    days = calculate_working_days(body.start_date, body.end_date)

    # 3. Balance check + deduct (raises ValueError on insufficient balance)
    try:
        await deduct_balance(db, current_user.id, body.leave_type_id, days, year)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    # 4. Create leave record
    leave = await create_leave(db, current_user.id, body)

    # 5. Audit log
    await write_log(
        db,
        user_id=current_user.id,
        action=AuditAction.LEAVE_APPLIED,
        entity=AuditEntity.LEAVE_REQUEST,
        entity_id=leave.id,
        meta={"days": days, "leave_type_id": body.leave_type_id},
    )

    # 6. Email notification (fire-and-forget via Celery)
    try:
        send_leave_applied_email(current_user, leave)
    except Exception:
        logger.warning("Leave applied email failed for user %s", current_user.email)

    return LeaveOut.model_validate(leave)


# ── GET /leaves/balance ───────────────────────────────────────────────────────
# Defined BEFORE /{id} to avoid route shadowing

@router.get("/balance", response_model=list[BalanceOut])
async def get_leave_balance(
    year: Optional[int] = Query(None, description="Year (defaults to current year)"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all leave type balances for the current user."""
    from datetime import date as date_cls
    target_year = year or date_cls.today().year
    return await get_balance(db, current_user.id, target_year)


# ── GET /leaves/my ────────────────────────────────────────────────────────────

@router.get("/my", response_model=LeaveListOut)
async def get_my_leaves(
    status_filter: Optional[LeaveStatus] = Query(None, alias="status"),
    leave_type_id: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at", pattern="^(created_at|start_date|end_date|status)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated, filtered, sorted list of the current user's leave requests."""
    skip = (page - 1) * limit
    leaves, total = await get_user_leaves(
        db,
        user_id=current_user.id,
        status=status_filter,
        leave_type_id=leave_type_id,
        start_date=start_date,
        end_date=end_date,
        sort_by=sort_by,
        sort_dir=sort_dir,
        skip=skip,
        limit=limit,
    )
    pages = ceil(total / limit) if total else 1
    return LeaveListOut(
        items=[LeaveOut.model_validate(l) for l in leaves],
        total=total,
        page=page,
        pages=pages,
    )


# ── GET /leaves/calendar ──────────────────────────────────────────────────────

@router.get("/calendar", response_model=list[CalendarLeaveOut])
async def get_calendar(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return leaves for a given month formatted for calendar display."""
    from datetime import date as date_cls
    today = date_cls.today()
    target_year  = year  or today.year
    target_month = month or today.month
    leaves = await get_calendar_leaves(db, current_user.id, target_year, target_month)
    return [CalendarLeaveOut.model_validate(l) for l in leaves]


# ── GET /leaves/{id} ──────────────────────────────────────────────────────────

@router.get("/{leave_id}", response_model=LeaveOut)
async def get_leave(
    leave_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a single leave. Employees can only view their own; managers/admins see all."""
    leave = await get_leave_by_id(db, leave_id)
    if not leave:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found.")

    is_privileged = current_user.role in (UserRole.MANAGER, UserRole.ADMIN)
    if not is_privileged and leave.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    return LeaveOut.model_validate(leave)


# ── DELETE /leaves/{id}/cancel ────────────────────────────────────────────────

@router.delete("/{leave_id}/cancel", response_model=LeaveOut)
async def cancel_leave_request(
    leave_id: int,
    body: CancelRequest = CancelRequest(),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a pending leave. Restores balance and writes audit log."""
    leave = await get_leave_by_id(db, leave_id)
    if not leave:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found.")

    if leave.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    if leave.status != LeaveStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Only pending leaves can be cancelled. Current status: {leave.status.value}.",
        )

    year = leave.start_date.year

    # Restore balance
    try:
        await restore_balance(db, current_user.id, leave.leave_type_id, leave.days, year)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    # Cancel the leave
    leave = await cancel_leave(db, leave, body.reason)

    # Audit log
    await write_log(
        db,
        user_id=current_user.id,
        action=AuditAction.LEAVE_CANCELLED,
        entity=AuditEntity.LEAVE_REQUEST,
        entity_id=leave.id,
        meta={"reason": body.reason, "days_restored": leave.days},
    )

    # Email notification
    try:
        send_leave_cancelled_email(current_user, leave)
    except Exception:
        logger.warning("Leave cancelled email failed for user %s", current_user.email)

    return LeaveOut.model_validate(leave)
