import logging
from datetime import date
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_role
from app.crud.leave import get_leave_by_id
from app.crud.manager import (
    approve_leave,
    check_team_conflicts,
    get_manager_stats,
    get_team_calendar,
    get_team_leaves,
    reject_leave,
)
from app.models.leave_request import LeaveStatus
from app.models.user import User, UserRole
from app.schemas.leave import LeaveOut
from app.schemas.manager import (
    ApproveRequest,
    ManagerStatsOut,
    RejectRequest,
    TeamCalendarOut,
    TeamConflictOut,
    TeamLeaveListOut,
    TeamLeaveOut,
)
from app.services.email import send_leave_status_email

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/manager",
    tags=["Manager"],
    dependencies=[Depends(require_role(UserRole.MANAGER, UserRole.ADMIN))],
)

# ── GET /manager/leaves ───────────────────────────────────────────────────────

@router.get("/leaves", response_model=TeamLeaveListOut)
async def list_team_leaves(
    status_filter: Optional[LeaveStatus] = Query(None, alias="status"),
    employee_id: Optional[str] = Query(None),
    leave_type_id: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    search: Optional[str] = Query(None, description="Search by employee name or email"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at", pattern="^(created_at|start_date|end_date|status|days)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    current_manager: User = Depends(require_role(UserRole.MANAGER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Paginated, filtered, searchable list of direct reports' leave requests."""
    skip = (page - 1) * limit
    items, total = await get_team_leaves(
        db,
        manager_id=current_manager.id,
        status=status_filter,
        employee_id=employee_id,
        leave_type_id=leave_type_id,
        start_date=start_date,
        end_date=end_date,
        search=search,
        sort_by=sort_by,
        sort_dir=sort_dir,
        skip=skip,
        limit=limit,
    )
    pages = ceil(total / limit) if total else 1
    return TeamLeaveListOut(items=items, total=total, page=page, pages=pages)


# ── PATCH /manager/leaves/{id}/approve ───────────────────────────────────────

@router.patch("/leaves/{leave_id}/approve", response_model=LeaveOut)
async def approve_leave_request(
    leave_id: int,
    body: ApproveRequest,
    current_manager: User = Depends(require_role(UserRole.MANAGER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Approve a pending leave. Only the requester's direct manager may approve."""
    leave = await get_leave_by_id(db, leave_id)
    if not leave:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found.")

    # Validate the leave belongs to a direct report
    if leave.user and leave.user.manager_id != current_manager.id:
        if current_manager.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only approve leaves for your direct reports.",
            )

    if leave.status != LeaveStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Only pending leaves can be approved. Current status: {leave.status.value}.",
        )

    leave = await approve_leave(db, leave, current_manager.id, body.remarks)

    try:
        if leave.user:
            send_leave_status_email(leave.user, leave, "approved", body.remarks or "")
    except Exception:
        logger.warning("Approve email failed for leave %s", leave_id)

    return LeaveOut.model_validate(leave)


# ── PATCH /manager/leaves/{id}/reject ────────────────────────────────────────

@router.patch("/leaves/{leave_id}/reject", response_model=LeaveOut)
async def reject_leave_request(
    leave_id: int,
    body: RejectRequest,
    current_manager: User = Depends(require_role(UserRole.MANAGER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Reject a pending leave. Remarks required. Restores employee balance."""
    leave = await get_leave_by_id(db, leave_id)
    if not leave:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found.")

    if leave.user and leave.user.manager_id != current_manager.id:
        if current_manager.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only reject leaves for your direct reports.",
            )

    if leave.status != LeaveStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Only pending leaves can be rejected. Current status: {leave.status.value}.",
        )

    leave = await reject_leave(db, leave, current_manager.id, body.remarks)

    try:
        if leave.user:
            send_leave_status_email(leave.user, leave, "rejected", body.remarks)
    except Exception:
        logger.warning("Reject email failed for leave %s", leave_id)

    return LeaveOut.model_validate(leave)


# ── GET /manager/stats ────────────────────────────────────────────────────────

@router.get("/stats", response_model=ManagerStatsOut)
async def manager_stats(
    year: Optional[int] = Query(None, description="Year (defaults to current year)"),
    current_manager: User = Depends(require_role(UserRole.MANAGER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Dashboard statistics for the manager's team."""
    from datetime import date as date_cls
    target_year = year or date_cls.today().year
    return await get_manager_stats(db, current_manager.id, target_year)


# ── GET /manager/team-calendar ────────────────────────────────────────────────

@router.get("/team-calendar", response_model=list[TeamCalendarOut])
async def team_calendar(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    current_manager: User = Depends(require_role(UserRole.MANAGER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """All approved/pending leaves for the team in a given month, grouped by day."""
    from datetime import date as date_cls
    today = date_cls.today()
    target_year  = year  or today.year
    target_month = month or today.month
    return await get_team_calendar(db, current_manager.id, target_year, target_month)


# ── GET /manager/team-conflicts ───────────────────────────────────────────────

@router.get("/team-conflicts", response_model=list[TeamConflictOut])
async def team_conflicts(
    start_date: date = Query(..., description="Range start date"),
    end_date: date   = Query(..., description="Range end date"),
    current_manager: User = Depends(require_role(UserRole.MANAGER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Returns team members who are on leave (pending/approved) in the given date range."""
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_date must be on or after start_date.",
        )
    return await check_team_conflicts(db, current_manager.id, start_date, end_date)
