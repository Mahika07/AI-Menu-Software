
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[int] = mapped_column(primary_key=True)

    bill_number: Mapped[str] = mapped_column(
        String(40),
        unique=True,
        nullable=False,
        index=True,
    )

    # Primary/anchor order.
    # Retained for compatibility with existing bills and APIs.
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Multiple orders can belong to one dining session.
    # A unique index ensures only one bill per dining session.
    # Nullable so existing historical bills remain valid.
    dining_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("dining_sessions.id", ondelete="RESTRICT"),
        nullable=True,
        unique=True,
        index=True,
    )

    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    # Cancellation tracking
    cancelled_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default="0",
    )

    cancelled_by: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    payment_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="unpaid",
        index=True,
    )

    payment_method: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    order = relationship("Order")
    dining_session = relationship("DiningSession")
    branch = relationship("Branch")
