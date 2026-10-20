"""merge customer number and password reset migrations

Revision ID: 4308f28c973b
Revises: b71c9a24d630, e7b6d4c2a901
Create Date: 2026-10-20 23:57:15.579201

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4308f28c973b'
down_revision: Union[str, Sequence[str], None] = ('b71c9a24d630', 'e7b6d4c2a901')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
