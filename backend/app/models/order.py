
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Order(Base):
    __tablename__ = "orders"

    __table_args__ = (
        CheckConstraint(
            "subtotal >= 0 AND total_amount >= 0",
            name="ck_orders_nonnegative_totals",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    order_number: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        nullable=False,
        index=True,
        default=lambda: uuid.uuid4().hex,
    )

    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    table_id: Mapped[int | None] = mapped_column(
        ForeignKey("tables.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    table_number: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    dining_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("dining_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        index=True,
    )

    
    customer_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    customer_number: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        index=True,
    )

    customer_note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    subtotal: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        default=0,
    )

    total_amount: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        default=0,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    branch = relationship("Branch")
    table = relationship("RestaurantTable")

    dining_session = relationship(
        "DiningSession",
        back_populates="orders",
    )

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    __table_args__ = (
        CheckConstraint(
            "quantity > 0",
            name="ck_order_items_positive_quantity",
        ),
        CheckConstraint(
            "unit_price >= 0 AND line_total >= 0",
            name="ck_order_items_nonnegative_prices",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    dish_id: Mapped[int | None] = mapped_column(
        ForeignKey("dishes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    dish_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    unit_price: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    line_total: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    special_instructions: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        server_default="pending",
        index=True,
    )

    status_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    dish = relationship("Dish")

    order: Mapped["Order"] = relationship(
        back_populates="items",
    )
