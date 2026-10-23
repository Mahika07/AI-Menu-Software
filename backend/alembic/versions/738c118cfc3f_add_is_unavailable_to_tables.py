
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
    # The restored migration 1fab06e834a1 already adds
    # tables.is_unavailable. Keep this migration as a no-op
    # to avoid adding the same column twice.
    pass
def downgrade() -> None:
    op.drop_column("tables", "is_unavailable")
