
"""add bill cancellation fields

Revision ID: 6f68ec1b8f3a
Revises: e8f813550f10
"""

from alembic import op
import sqlalchemy as sa


revision = "6f68ec1b8f3a"
down_revision = "e8f813550f10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bills",
        sa.Column(
            "cancelled_amount",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

    op.add_column(
        "bills",
        sa.Column(
            "cancelled_by",
            sa.String(length=20),
            nullable=True,
        ),
    )

    op.add_column(
        "bills",
        sa.Column(
            "cancelled_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("bills", "cancelled_at")
    op.drop_column("bills", "cancelled_by")
    op.drop_column("bills", "cancelled_amount")
