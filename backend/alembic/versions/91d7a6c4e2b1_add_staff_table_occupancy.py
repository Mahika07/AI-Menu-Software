
"""add staff-controlled table occupancy"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "91d7a6c4e2b1"
down_revision: Union[str, Sequence[str], None] = "738c118cfc3f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tables",
        sa.Column(
            "is_occupied",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    op.alter_column(
        "tables",
        "is_occupied",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("tables", "is_occupied")
