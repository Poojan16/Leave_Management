import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_user, get_db, require_role
from app.models.leave_balance import LeaveBalance
from app.models.leave_request import LeaveRequest, LeaveStatus
from app.models.user import User, UserRole
from app.services import ai as ai_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ParseLeaveRequest(BaseModel):
    text: str


class ParseLeaveResponse(BaseModel):
    leave_type: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    reason: str | None = None
    confidence: float = 0.0


# ── POST /ai/parse-leave ──────────────────────────────────────────────────────

@router.post("/parse-leave", response_model=ParseLeaveResponse)
async def parse_leave(
    request: Request,
    body: ParseLeaveRequest,
    current_user: User = Depends(get_current_active_user),
):
    """
    Parse a natural-language leave description into structured leave data.
    Rate limited: 20 req/min.
    """
    if not body.text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Text cannot be empty.",
        )
    try:
        result = ai_service.parse_leave_request(body.text)
        return ParseLeaveResponse(**result)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except Exception as exc:
        logger.error("AI parse-leave error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="AI service error.")


# ── GET /ai/anomalies ─────────────────────────────────────────────────────────

@router.get("/anomalies")
async def get_anomalies(
    request: Request,
    current_user: User = Depends(require_role(UserRole.MANAGER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """
    Detect leave anomalies for the manager's team (or all users for admin).
    Rate limited: 20 req/min.
    """
    try:
        if current_user.role == UserRole.ADMIN:
            result = await db.execute(select(LeaveRequest))
        else:
            # Manager: only direct reports
            team_ids_result = await db.execute(
                select(User.id).where(User.manager_id == current_user.id)
            )
            team_ids = [r[0] for r in team_ids_result.all()]
            if not team_ids:
                return []
            result = await db.execute(
                select(LeaveRequest).where(LeaveRequest.user_id.in_(team_ids))
            )

        leaves = result.scalars().all()
        history = [
            {
                "user_id": l.user_id,
                "employee_name": l.user.full_name if l.user else f"User {l.user_id}",
                "start_date": str(l.start_date),
                "end_date": str(l.end_date),
                "days": l.days,
                "status": l.status.value,
                "leave_type": l.leave_type.name if l.leave_type else "",
            }
            for l in leaves
        ]
        return ai_service.detect_anomalies(history)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except Exception as exc:
        logger.error("AI anomalies error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="AI service error.")


# ── GET /ai/suggestions ───────────────────────────────────────────────────────

@router.get("/suggestions")
async def get_suggestions(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """
    Get personalised leave planning suggestions for the current employee.
    Rate limited: 20 req/min.
    """
    from datetime import date

    try:
        # Fetch balances
        bal_result = await db.execute(
            select(LeaveBalance).where(
                LeaveBalance.user_id == current_user.id,
                LeaveBalance.year == date.today().year,
            )
        )
        balances = bal_result.scalars().all()
        balance_data = [
            {
                "leave_type": {"name": b.leave_type.name if b.leave_type else ""},
                "remaining": b.remaining,
                "allocated": b.allocated,
                "used": b.used,
            }
            for b in balances
        ]

        # Fetch upcoming approved leaves
        upcoming_result = await db.execute(
            select(LeaveRequest).where(
                LeaveRequest.user_id == current_user.id,
                LeaveRequest.status == LeaveStatus.APPROVED,
                LeaveRequest.start_date >= date.today(),
            )
        )
        upcoming = upcoming_result.scalars().all()
        upcoming_data = [
            {"start_date": str(l.start_date), "end_date": str(l.end_date), "days": l.days}
            for l in upcoming
        ]

        return ai_service.suggest_leave_plan(current_user.id, balance_data, upcoming_data)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except Exception as exc:
        logger.error("AI suggestions error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="AI service error.")
