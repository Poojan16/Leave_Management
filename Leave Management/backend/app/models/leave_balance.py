from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class LeaveBalance(Base):
    __tablename__ = "leave_balances"

    __table_args__ = (
        UniqueConstraint("user_id", "leave_type_id", "year", name="uq_balance_user_type_year"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_type_id = Column(Integer, ForeignKey("leave_types.id", ondelete="CASCADE"), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    allocated = Column(Integer, nullable=False, default=0)
    used = Column(Integer, nullable=False, default=0)
    carried_forward = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="leave_balances", lazy="selectin")
    leave_type = relationship("LeaveType", back_populates="leave_balances", lazy="selectin")

    @property
    def remaining(self) -> int:
        return self.allocated + self.carried_forward - self.used

    def __repr__(self) -> str:
        return (
            f"<LeaveBalance(user_id={self.user_id}, type_id={self.leave_type_id}, "
            f"year={self.year}, remaining={self.remaining})>"
        )
