
"""add customer number to orders

Revision ID: b71c9a24d630
Revises: 0a2bfac91cf4
"""

from alembic import op
import sqlalchemy as sa


revision = "b71c9a24d630"
down_revision = "0a2bfac91cf4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("customer_number", sa.String(length=20), nullable=True),
    )
    op.create_index(
        "ix_orders_customer_number",
        "orders",
        ["customer_number"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_orders_customer_number",
        table_name="orders",
    )
    op.drop_column("orders", "customer_number")
