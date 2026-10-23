"""add is_unavailable to tables

Revision ID: 1fab06e834a1
Revises: 8f1a13c6bfc2
Create Date: 2026-10-22 22:47:26.814538

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1fab06e834a1'
down_revision: Union[str, Sequence[str], None] = '8f1a13c6bfc2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("tables"):
        return

    columns = {
        column["name"]
        for column in inspector.get_columns("tables")
    }

    if "is_unavailable" not in columns:
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
