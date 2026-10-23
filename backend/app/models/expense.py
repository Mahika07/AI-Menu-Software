from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    category: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(250), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    incurred_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    branch = relationship("Branch")
    created_by = relationship("User")
