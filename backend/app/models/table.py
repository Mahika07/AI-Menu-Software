import uuid

from sqlalchemy import ForeignKey, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class RestaurantTable(Base):
    __tablename__ = "tables"

    id: Mapped[int] = mapped_column(primary_key=True)

    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    table_number: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    qr_token: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        nullable=False,
        index=True,
        default=lambda: uuid.uuid4().hex,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    # Temporary operational block, separate from system activation.
    is_unavailable: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    branch = relationship(
        "Branch",
        back_populates="tables",
    )