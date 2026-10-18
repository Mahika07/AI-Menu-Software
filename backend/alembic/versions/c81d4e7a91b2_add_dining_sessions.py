
"""Add dining sessions and associate orders with sessions."""

from alembic import op
import sqlalchemy as sa


revision = "c81d4e7a91b2"
down_revision = "bc8217d4a6c1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "dining_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "table_id",
            sa.Integer(),
            sa.ForeignKey("tables.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "closed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.create_index(
        "ix_dining_sessions_table_id",
        "dining_sessions",
        ["table_id"],
    )
    op.create_index(
        "ix_dining_sessions_token",
        "dining_sessions",
        ["token"],
        unique=True,
    )

    op.add_column(
        "orders",
        sa.Column(
            "dining_session_id",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.create_foreign_key(
        "fk_orders_dining_session_id",
        "orders",
        "dining_sessions",
        ["dining_session_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index(
        "ix_orders_dining_session_id",
        "orders",
        ["dining_session_id"],
    )


def downgrade():
    op.drop_index("ix_orders_dining_session_id", table_name="orders")
    op.drop_constraint(
        "fk_orders_dining_session_id",
        "orders",
        type_="foreignkey",
    )
    op.drop_column("orders", "dining_session_id")

    op.drop_index("ix_dining_sessions_token", table_name="dining_sessions")
    op.drop_index("ix_dining_sessions_table_id", table_name="dining_sessions")
    op.drop_table("dining_sessions")
