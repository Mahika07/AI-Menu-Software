"""Add per-item kitchen status and status timestamp."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "bc8217d4a6c1"
down_revision: Union[str, Sequence[str], None] = "9c094a05c354"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "order_items",
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
    )

    op.add_column(
        "order_items",
        sa.Column(
            "status_updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_index(
        "ix_order_items_status",
        "order_items",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_order_items_status",
        table_name="order_items",
    )
    op.drop_column("order_items", "status_updated_at")
    op.drop_column("order_items", "status")
