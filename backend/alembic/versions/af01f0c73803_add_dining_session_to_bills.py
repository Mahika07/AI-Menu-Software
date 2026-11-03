"""add dining session to bills

Revision ID: abc123xyz
Revises: 6f68ec1b8f3a
"""

from alembic import op
import sqlalchemy as sa


revision = "abc123xyz"  # Replace with your generated ID
down_revision = "6f68ec1b8f3a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bills",
        sa.Column(
            "dining_session_id",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.create_foreign_key(
        "fk_bills_dining_session_id",
        "bills",
        "dining_sessions",
        ["dining_session_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.create_index(
        "ix_bills_dining_session_id",
        "bills",
        ["dining_session_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bills_dining_session_id",
        table_name="bills",
    )

    op.drop_constraint(
        "fk_bills_dining_session_id",
        "bills",
        type_="foreignkey",
    )

    op.drop_column(
        "bills",
        "dining_session_id",
    )