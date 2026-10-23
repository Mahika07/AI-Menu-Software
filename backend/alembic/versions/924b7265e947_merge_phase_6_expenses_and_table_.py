"""merge phase 6 expenses and table occupancy

Revision ID: 924b7265e947
Revises: 4e6a9c2d7b10, 91d7a6c4e2b1
Create Date: 2026-10-23 13:53:22.366488

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '924b7265e947'
down_revision: Union[str, Sequence[str], None] = ('4e6a9c2d7b10', '91d7a6c4e2b1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
