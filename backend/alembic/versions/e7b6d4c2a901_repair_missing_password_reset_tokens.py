
"""repair missing password reset token table"""
from typing import Sequence, Union

from alembic import op, context
import sqlalchemy as sa

revision: str = "e7b6d4c2a901"
down_revision: Union[str, Sequence[str], None] = "d45c93b110a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Schema inspection requires a live database connection.
    # Skip inspection when Alembic generates offline SQL.
    if context.is_offline_mode():
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("password_reset_tokens"):
        op.create_table(
            "password_reset_tokens",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )

    existing_indexes = {
        index["name"]
        for index in sa.inspect(bind).get_indexes("password_reset_tokens")
    }

    if "ix_password_reset_tokens_user_id" not in existing_indexes:
        op.create_index(
            "ix_password_reset_tokens_user_id",
            "password_reset_tokens",
            ["user_id"],
        )

    if "ix_password_reset_tokens_token_hash" not in existing_indexes:
        op.create_index(
            "ix_password_reset_tokens_token_hash",
            "password_reset_tokens",
            ["token_hash"],
            unique=True,
        )

    if "ix_password_reset_tokens_expires_at" not in existing_indexes:
        op.create_index(
            "ix_password_reset_tokens_expires_at",
            "password_reset_tokens",
            ["expires_at"],
        )


def downgrade() -> None:
    # This table may have existed before the repair migration.
    # Do not automatically delete it or its indexes.
    pass
