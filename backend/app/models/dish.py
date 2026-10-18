from decimal import Decimal

from sqlalchemy import (
    ForeignKey,
    String,
    Text,
    Numeric,
    Boolean,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Dish(Base):
    __tablename__ = "dishes"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    # ---------------------------------------------------------
    # Dish Image
    # ---------------------------------------------------------

    image_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    ingredients: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    spice_level: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    dietary_type: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    allergens: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    serving_size: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    is_available: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    # ---------------------------------------------------------
    # Relationships
    # ---------------------------------------------------------

    category = relationship(
        "Category",
        back_populates="dishes",
    )

    branch = relationship(
        "Branch",
        back_populates="dishes",
    )

    reviews = relationship(
        "Review",
        back_populates="dish",
        cascade="all, delete-orphan",
    )