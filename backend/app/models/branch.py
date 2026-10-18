from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Branch(Base):
    __tablename__ = "branches"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey(
            "restaurants.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    address: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    phone: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    is_active: Mapped[bool] = mapped_column(
        default=True,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    # Branch → Restaurant
    restaurant = relationship(
        "Restaurant",
        back_populates="branches",
    )

    # Branch → Categories
    categories = relationship(
        "Category",
        back_populates="branch",
        cascade="all, delete-orphan",
    )

    # Branch → Dishes
    dishes = relationship(
        "Dish",
        back_populates="branch",
        cascade="all, delete-orphan",
    )

    # Branch → Tables
    tables = relationship(
        "RestaurantTable",
        back_populates="branch",
        cascade="all, delete-orphan",
    )