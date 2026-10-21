from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, or_
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app.core.dependencies import get_current_user
from app.database.connection import get_db
from app.models.branch import Branch
from app.models.order import Order
from app.models.order import OrderItem
from app.models.restaurant import Restaurant
from app.models.user import User
from app.schemas.order import (
    OrderItemStatusUpdate,
    OrderStatusUpdate,
    OwnerOrderResponse,
)


router = APIRouter(
    prefix="/branches/{branch_id}/orders",
    tags=["Restaurant Orders"],
)


ALLOWED_TRANSITIONS = {
    "pending": {"confirmed", "cancelled"},
    "confirmed": {"preparing", "cancelled"},
    "preparing": {"ready", "cancelled"},
    "ready": {"completed"},
    "completed": set(),
    "cancelled": set(),
}


ITEM_TRANSITIONS = {
    "pending": {"preparing", "cancelled"},
    "preparing": {"ready", "cancelled"},
    "ready": {"served", "cancelled"},
    "served": set(),
    "cancelled": set(),
}


ORDER_STATUSES = {
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "completed",
    "cancelled",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_owned_branch(
    branch_id: int,
    current_user: User,
    db: Session,
) -> Branch:
    branch = (
        db.query(Branch)
        .join(
            Restaurant,
            Restaurant.id == Branch.restaurant_id,
        )
        .filter(
            Branch.id == branch_id,
            Restaurant.owner_id == current_user.id,
        )
        .first()
    )

    if branch is None:
        raise HTTPException(
            status_code=404,
            detail="Branch not found.",
        )

    return branch


def get_order_with_items(
    db: Session,
    branch_id: int,
    order_id: int,
) -> Order | None:
    return (
        db.query(Order)
        .options(selectinload(Order.items))
        .filter(
            Order.id == order_id,
            Order.branch_id == branch_id,
        )
        .first()
    )


def recalculate_order_status(order: Order) -> None:
    """Recalculate the order status without regressing a mixed-progress order.

    Individual item statuses are authoritative. An order is completed only
    when every item is served or cancelled and at least one was served.
    If any item is still pending while another item has progressed to ready
    or served, keep the overall order active as ``preparing`` rather than
    incorrectly downgrading it to ``pending`` or ``confirmed``.
    """
    items = list(order.items or [])

    if not items:
        return

    statuses = [item.status or "pending" for item in items]
    now = utc_now()

    if all(value == "cancelled" for value in statuses):
        order.status = "cancelled"
    elif (
        all(value in {"served", "cancelled"} for value in statuses)
        and any(value == "served" for value in statuses)
    ):
        order.status = "completed"
    elif "preparing" in statuses:
        order.status = "preparing"
    elif "pending" in statuses and any(
        value in {"ready", "served"} for value in statuses
    ):
        order.status = "preparing"
    elif all(
        value in {"ready", "served", "cancelled"} for value in statuses
    ):
        order.status = "ready"
    elif "pending" in statuses:
        order.status = (
            "confirmed" if order.status == "confirmed" else "pending"
        )

    order.updated_at = now


def set_item_status(
    item: OrderItem,
    new_status: str,
    now: datetime,
) -> None:
    item.status = new_status
    item.status_updated_at = now


@router.get("", response_model=list[OwnerOrderResponse])
def list_branch_orders(
    branch_id: int,
    order_status: Literal[
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "completed",
        "cancelled",
    ] | None = Query(default=None, alias="status"),
    table_number: str | None = Query(
        default=None,
        max_length=50,
    ),
    limit: int = Query(default=200, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(
        branch_id,
        current_user,
        db,
    )

    query = (
        db.query(Order)
        .options(selectinload(Order.items))
        .filter(Order.branch_id == branch.id)
    )

    if order_status is not None:
        query = query.filter(Order.status == order_status)

    if table_number:
        query = query.filter(
            Order.table_number == table_number.strip()
        )

    return (
        query
        .order_by(
            Order.created_at.desc(),
            Order.id.desc(),
        )
        .limit(limit)
        .all()
    )


@router.get("/history")
def list_branch_order_history(
    branch_id: int,
    search: str | None = Query(default=None, max_length=100),
    order_status: Literal[
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "completed",
        "cancelled",
    ] | None = Query(default=None, alias="status"),
    table_number: str | None = Query(default=None, max_length=50),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search and paginate order history for an owned branch."""

    branch = get_owned_branch(
        branch_id,
        current_user,
        db,
    )

    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="Start date cannot be after end date.",
        )

    query = db.query(Order).filter(
        Order.branch_id == branch.id,
    )

    if order_status:
        query = query.filter(Order.status == order_status)

    if table_number and table_number.strip():
        query = query.filter(
            Order.table_number == table_number.strip()
        )

    if search and search.strip():
        term = search.strip()
        pattern = f"%{term}%"

        search_conditions = [
            Order.order_number.ilike(pattern),
            Order.customer_name.ilike(pattern),
        ]

        # Support customer mobile search when the model has this field.
        if hasattr(Order, "customer_number"):
            search_conditions.append(
                Order.customer_number.ilike(pattern)
            )

        query = query.filter(or_(*search_conditions))

    if start_date:
        start_datetime = datetime.combine(
            start_date,
            time.min,
            tzinfo=timezone.utc,
        )
        query = query.filter(
            Order.created_at >= start_datetime
        )

    if end_date:
        end_datetime = datetime.combine(
            end_date + timedelta(days=1),
            time.min,
            tzinfo=timezone.utc,
        )
        query = query.filter(
            Order.created_at < end_datetime
        )

    total = query.order_by(None).count()

    items = (
        query
        .options(selectinload(Order.items))
        .order_by(
            Order.created_at.desc(),
            Order.id.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.patch(
    "/{order_id}/status",
    response_model=OwnerOrderResponse,
)
def update_order_status(
    branch_id: int,
    order_id: int,
    payload: OrderStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(
        branch_id,
        current_user,
        db,
    )

    order = get_order_with_items(
        db,
        branch.id,
        order_id,
    )

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found.",
        )

    if payload.status not in ALLOWED_TRANSITIONS.get(
        order.status,
        set(),
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot change an order from "
                f"'{order.status}' to '{payload.status}'."
            ),
        )

    now = utc_now()

    # Bulk order actions are kept for compatibility with the
    # existing Orders page. Individual kitchen controls should
    # use the item-status endpoint below.
    if payload.status == "preparing":
        for item in order.items:
            if item.status == "pending":
                set_item_status(item, "preparing", now)

    elif payload.status == "ready":
        for item in order.items:
            if item.status in {"pending", "preparing"}:
                set_item_status(item, "ready", now)

    elif payload.status == "completed":
        for item in order.items:
            if item.status == "ready":
                set_item_status(item, "served", now)

    elif payload.status == "cancelled":
        for item in order.items:
            if item.status in {
                "pending",
                "preparing",
                "ready",
            }:
                set_item_status(item, "cancelled", now)

    recalculate_order_status(order)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return get_order_with_items(
        db,
        branch.id,
        order_id,
    )


@router.patch(
    "/{order_id}/items/{item_id}/status",
    response_model=OwnerOrderResponse,
)
def update_order_item_status(
    branch_id: int,
    order_id: int,
    item_id: int,
    payload: OrderItemStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(
        branch_id,
        current_user,
        db,
    )

    order = get_order_with_items(
        db,
        branch.id,
        order_id,
    )

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found.",
        )

    if order.status in {"completed", "cancelled"}:
        raise HTTPException(
            status_code=409,
            detail="This order is already closed.",
        )

    item = next(
        (
            entry
            for entry in order.items
            if entry.id == item_id
        ),
        None,
    )

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Order item not found.",
        )

    current_item_status = item.status or "pending"

    if payload.status not in ITEM_TRANSITIONS.get(
        current_item_status,
        set(),
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot change item from "
                f"'{current_item_status}' to '{payload.status}'."
            ),
        )

    now = utc_now()

    set_item_status(
        item,
        payload.status,
        now,
    )

    recalculate_order_status(order)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return get_order_with_items(
        db,
        branch.id,
        order_id,
    )
