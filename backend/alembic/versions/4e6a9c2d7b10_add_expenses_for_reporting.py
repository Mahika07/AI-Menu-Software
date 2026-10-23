"""add expenses for reporting

Revision ID: 4e6a9c2d7b10
Revises: 738c118cfc3f
Create Date: 2026-10-23
"""
from alembic import op
import sqlalchemy as sa

revision = "4e6a9c2d7b10"
down_revision = "738c118cfc3f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("branch_id", sa.Integer(), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("description", sa.String(length=250), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("incurred_on", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),
    )
    op.create_index("ix_expenses_branch_id", "expenses", ["branch_id"])
    op.create_index("ix_expenses_created_by_user_id", "expenses", ["created_by_user_id"])
    op.create_index("ix_expenses_category", "expenses", ["category"])
    op.create_index("ix_expenses_incurred_on", "expenses", ["incurred_on"])


def downgrade() -> None:
    op.drop_index("ix_expenses_incurred_on", table_name="expenses")
    op.drop_index("ix_expenses_category", table_name="expenses")
    op.drop_index("ix_expenses_created_by_user_id", table_name="expenses")
    op.drop_index("ix_expenses_branch_id", table_name="expenses")
    op.drop_table("expenses")
