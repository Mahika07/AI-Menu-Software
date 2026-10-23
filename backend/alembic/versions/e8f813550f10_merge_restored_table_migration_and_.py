"""merge restored table migration and phase 6

Revision ID: e8f813550f10
Revises: 1fab06e834a1, 924b7265e947
Create Date: 2026-10-23 15:10:56.845142

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8f813550f10'
down_revision: Union[str, Sequence[str], None] = ('1fab06e834a1', '924b7265e947')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
