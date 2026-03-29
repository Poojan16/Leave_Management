from sqlalchemy import Column, Integer, String, Boolean, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


class LeaveType(Base):
    __tablename__ = "leave_types"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    max_days_per_year = Column(Integer, nullable=False, default=0)
    carry_forward = Column(Boolean, default=False, nullable=False)

    # Relationships
    leave_balances = relationship("LeaveBalance", back_populates="leave_type", lazy="selectin")
    leave_requests = relationship("LeaveRequest", back_populates="leave_type", lazy="selectin")

    def __repr__(self) -> str:
        return f"<LeaveType(id={self.id}, name={self.name!r}, max_days={self.max_days_per_year})>"
