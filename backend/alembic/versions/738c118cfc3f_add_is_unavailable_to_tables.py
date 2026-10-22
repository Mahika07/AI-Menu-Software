
"""add is_unavailable to tables"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# Keep these revision identifiers consistent with your existing history.
revision: str = "738c118cfc3f"
down_revision: Union[str, Sequence[str], None] = "8f1a13c6bfc2"
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
