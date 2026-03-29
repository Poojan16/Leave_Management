from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


# ── Action constants ──────────────────────────────────────────────────────────

class AuditAction:
    # Leave actions
    LEAVE_APPLIED    = "LEAVE_APPLIED"
    LEAVE_CANCELLED  = "LEAVE_CANCELLED"
    LEAVE_APPROVED   = "LEAVE_APPROVED"
    LEAVE_REJECTED   = "LEAVE_REJECTED"

    # User actions
    USER_CREATED     = "USER_CREATED"
    USER_UPDATED     = "USER_UPDATED"
    USER_DEACTIVATED = "USER_DEACTIVATED"

    # Auth actions
    USER_LOGIN       = "USER_LOGIN"
    USER_LOGOUT      = "USER_LOGOUT"
    PASSWORD_RESET   = "PASSWORD_RESET"


# ── Entity constants ──────────────────────────────────────────────────────────

class AuditEntity:
    LEAVE_REQUEST = "leave_request"
    USER          = "user"


# ── Writer ────────────────────────────────────────────────────────────────────

async def write_log(
    db: AsyncSession,
    user_id: Optional[int],
    action: str,
    entity: str,
    entity_id: Optional[int] = None,
    meta: Optional[dict[str, Any]] = None,
) -> AuditLog:
    log = AuditLog(
        user_id=user_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        meta=meta,
    )
    db.add(log)
    await db.flush()
    return log
