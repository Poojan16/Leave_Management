import enum
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Enum, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class LeaveStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    __table_args__ = (
        Index("ix_leave_requests_user_status", "user_id", "status"),
        Index("ix_leave_requests_dates", "start_date", "end_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_type_id = Column(Integer, ForeignKey("leave_types.id", ondelete="RESTRICT"), nullable=False, index=True)
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)
    days = Column(Integer, nullable=False)
    status = Column(Enum(LeaveStatus), default=LeaveStatus.PENDING, nullable=False, index=True)
    reason = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="leave_requests", lazy="selectin")
    leave_type = relationship("LeaveType", back_populates="leave_requests", lazy="selectin")
    approvals = relationship("LeaveApproval", back_populates="leave_request", lazy="selectin", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return (
            f"<LeaveRequest(id={self.id}, user_id={self.user_id}, "
            f"status={self.status}, days={self.days})>"
        )
