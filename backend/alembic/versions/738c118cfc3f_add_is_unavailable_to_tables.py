"""add is_unavailable to tables

Revision ID: 738c118cfc3f
Revises: 8f1a13c6bfc2
Create Date: 2026-10-22 23:03:55.560747

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '738c118cfc3f'
down_revision: Union[str, Sequence[str], None] = '8f1a13c6bfc2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tables",
        sa.Column(
            "is_unavailable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    op.alter_column(
        "tables",
        "is_unavailable",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("tables", "is_unavailable")