import enum
from sqlalchemy import Column, Integer, String, Text, DateTime, Enum, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class ApprovalAction(str, enum.Enum):
    APPROVED = "approved"
    REJECTED = "rejected"


class LeaveApproval(Base):
    __tablename__ = "leave_approvals"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    request_id = Column(Integer, ForeignKey("leave_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    approver_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(Enum(ApprovalAction), nullable=False)
    remarks = Column(Text, nullable=True)
    actioned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    leave_request = relationship("LeaveRequest", back_populates="approvals", lazy="selectin")
    approver = relationship("User", foreign_keys=[approver_id], lazy="selectin")

    def __repr__(self) -> str:
        return (
            f"<LeaveApproval(id={self.id}, request_id={self.request_id}, "
            f"action={self.action}, approver_id={self.approver_id})>"
        )
