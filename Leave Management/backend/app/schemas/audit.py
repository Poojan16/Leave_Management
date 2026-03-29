from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    user_name: Optional[str] = None
    action: str
    entity: str
    entity_id: Optional[int] = None
    meta: Optional[dict[str, Any]] = None
    timestamp: datetime

    model_config = {"from_attributes": True}
