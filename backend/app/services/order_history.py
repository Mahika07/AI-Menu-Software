"""Helpers for preventing deletion of records with order history."""

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.models.branch import Branch
from app.models.order import Order


def _orders_table_exists(db: Session) -> bool:
    """Support databases that have not yet applied the orders migration."""
    return inspect(db.get_bind()).has_table(Order.__tablename__)


def branch_has_order_history(db: Session, branch_id: int) -> bool:
    if not _orders_table_exists(db):
        return False

    return (
        db.query(Order.id)
        .filter(Order.branch_id == branch_id)
        .first()
        is not None
    )


def restaurant_has_order_history(db: Session, restaurant_id: int) -> bool:
    if not _orders_table_exists(db):
        return False

    return (
        db.query(Order.id)
        .join(Branch, Order.branch_id == Branch.id)
        .filter(Branch.restaurant_id == restaurant_id)
        .first()
        is not None
    )