from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.core.dependencies import get_current_user
from app.database.connection import get_db
from app.models.bill import Bill
from app.models.branch import Branch
from app.models.order import Order, OrderItem
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


CENT = Decimal("0.01")

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


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


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
    items = list(order.items or [])

    if not items:
        return

    statuses = [
        item.status or "pending"
        for item in items
    ]

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
        value in {"ready", "served"}
        for value in statuses
    ):
        order.status = "preparing"

    elif all(
        value in {"ready", "served", "cancelled"}
        for value in statuses
    ):
        order.status = "ready"

    elif "pending" in statuses:
        order.status = (
            "confirmed"
            if order.status == "confirmed"
            else "pending"
        )

    order.updated_at = utc_now()


def set_item_status(
    item: OrderItem,
    new_status: str,
    now: datetime,
) -> None:
    item.status = new_status
    item.status_updated_at = now



def recalculate_bill_for_order(
    db: Session,
    order: Order,
    cancelled_by: str,
) -> None:
    """
    Recalculate the bill using active order items only.

    Cancelled items remain in the order history.
    Their original prices and quantities are not changed.
    """

    bill = (
        db.query(Bill)
        .filter(Bill.order_id == order.id)
        .with_for_update()
        .first()
    )

    if bill is None:
        return

    cancelled_items = [
        item
        for item in order.items
        if (item.status or "pending") == "cancelled"
    ]

    active_items = [
        item
        for item in order.items
        if (item.status or "pending") != "cancelled"
    ]

    cancelled_amount = money(
        sum(
            (
                Decimal(str(item.line_total or 0))
                for item in cancelled_items
            ),
            Decimal("0.00"),
        )
    )

    new_subtotal = money(
        sum(
            (
                Decimal(str(item.line_total or 0))
                for item in active_items
            ),
            Decimal("0.00"),
        )
    )

    old_subtotal = money(
        Decimal(str(bill.subtotal or 0))
    )

    old_discount = money(
        Decimal(str(bill.discount_amount or 0))
    )

    old_tax = money(
        Decimal(str(bill.tax_amount or 0))
    )

    old_taxable_amount = max(
        old_subtotal - old_discount,
        Decimal("0.00"),
    )

    # Preserve the effective tax rate already used by this bill.
    tax_rate = (
        old_tax / old_taxable_amount
        if old_taxable_amount > 0
        else Decimal("0.00")
    )

    new_discount = min(
        old_discount,
        new_subtotal,
    )

    new_taxable_amount = max(
        new_subtotal - new_discount,
        Decimal("0.00"),
    )

    new_tax = money(
        new_taxable_amount * tax_rate
    )

    new_total = money(
        new_taxable_amount + new_tax
    )

    bill.subtotal = new_subtotal
    bill.discount_amount = new_discount
    bill.tax_amount = new_tax
    bill.total_amount = new_total

    bill.cancelled_amount = cancelled_amount
    bill.cancelled_by = cancelled_by
    bill.cancelled_at = utc_now()

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
        pattern = f"%{search.strip()}%"

        conditions = [
            Order.order_number.ilike(pattern),
            Order.customer_name.ilike(pattern),
        ]

        if hasattr(Order, "customer_number"):
            conditions.append(
                Order.customer_number.ilike(pattern)
            )

        query = query.filter(or_(*conditions))

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

    if payload.status == "cancelled":
        recalculate_bill_for_order(db, order, cancelled_by="owner")

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

    if payload.status == "cancelled":
        recalculate_bill_for_order(db, order, cancelled_by="owner")

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