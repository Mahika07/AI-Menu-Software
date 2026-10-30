import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session, selectinload

from app.core.rate_limit import limiter
from app.database.connection import get_db
from app.models.bill import Bill
from app.models.branch import Branch
from app.models.customer import Customer
from app.models.dining_session import DiningSession
from app.models.dish import Dish
from app.models.order import Order, OrderItem
from app.models.table import RestaurantTable
from app.schemas.order import (
    OrderCreate,
    OrderResponse,
    PublicOrderStatusResponse,
)

router = APIRouter(prefix="/public", tags=["Public Orders"])

CENT = Decimal("0.01")
SESSION_DURATION = timedelta(days=36500)
ACTIVE_ORDER_STATUSES = ["pending", "confirmed", "preparing", "ready"]


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def recalculate_bill_for_order(
    db: Session,
    order: Order,
    cancelled_by: str,
) -> None:
    """Update an existing bill from non-cancelled items without deleting history."""
    bill = (
        db.query(Bill)
        .filter(Bill.order_id == order.id)
        .with_for_update()
        .first()
    )

    if bill is None:
        return

    cancelled_items = [
        item for item in order.items
        if (item.status or "pending") == "cancelled"
    ]

    active_items = [
        item for item in order.items
        if (item.status or "pending") != "cancelled"
    ]

    cancelled_amount = money(
        sum(
            (Decimal(str(item.line_total or 0)) for item in cancelled_items),
            Decimal("0.00"),
        )
    )

    new_subtotal = money(
        sum(
            (Decimal(str(item.line_total or 0)) for item in active_items),
            Decimal("0.00"),
        )
    )

    old_subtotal = money(Decimal(str(bill.subtotal or 0)))
    old_discount = money(Decimal(str(bill.discount_amount or 0)))
    old_tax = money(Decimal(str(bill.tax_amount or 0)))

    old_taxable = max(
        old_subtotal - old_discount,
        Decimal("0.00"),
    )

    tax_rate = (
        old_tax / old_taxable
        if old_taxable > 0
        else Decimal("0.00")
    )

    new_discount = min(old_discount, new_subtotal)

    new_taxable = max(
        new_subtotal - new_discount,
        Decimal("0.00"),
    )

    new_tax = money(new_taxable * tax_rate)

    bill.subtotal = new_subtotal
    bill.discount_amount = new_discount
    bill.tax_amount = new_tax
    bill.total_amount = money(new_taxable + new_tax)

    bill.cancelled_amount = cancelled_amount
    bill.cancelled_by = cancelled_by
    bill.cancelled_at = datetime.now(timezone.utc)


def get_active_table_and_branch(
    qr_token: str,
    db: Session,
) -> tuple[RestaurantTable, Branch]:

    table = (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.qr_token == qr_token,
            RestaurantTable.is_active.is_(True),
            RestaurantTable.is_unavailable.is_(False),
        )
        .first()
    )

    if not table:
        raise HTTPException(
            status_code=404,
            detail=(
                "This table is unavailable for ordering. "
                "Please contact restaurant staff."
            ),
        )

    branch = (
        db.query(Branch)
        .filter(
            Branch.id == table.branch_id,
            Branch.is_active.is_(True),
        )
        .first()
    )

    if not branch:
        raise HTTPException(
            status_code=404,
            detail="This table or its QR code is unavailable.",
        )

    return table, branch


def get_valid_dining_session(
    qr_token: str,
    session_token: str,
    db: Session,
) -> tuple[RestaurantTable, Branch, DiningSession]:

    if not session_token:
        raise HTTPException(
            status_code=401,
            detail=(
                "Dining session is being prepared. "
                "Please refresh the menu in a moment."
            ),
        )

    table, branch = get_active_table_and_branch(qr_token, db)

    session = (
        db.query(DiningSession)
        .filter(
            DiningSession.token == session_token,
            DiningSession.table_id == table.id,
        )
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=401,
            detail="Dining session is no longer valid. Please refresh the menu.",
        )

    if session.closed_at is not None:
        raise HTTPException(
            status_code=410,
            detail="This dining session has ended. Please refresh the menu.",
        )

    return table, branch, session


@router.post("/tables/{qr_token}/sessions", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def create_dining_session(
    qr_token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create an internal browser session for an active table."""

    table, _branch = get_active_table_and_branch(qr_token, db)

    session = DiningSession(
        table_id=table.id,
        token=secrets.token_urlsafe(32),
        expires_at=datetime.now(timezone.utc) + SESSION_DURATION,
    )

    try:
        db.add(session)
        db.commit()
        db.refresh(session)

        return {
            "token": session.token,
            "expires_at": session.expires_at,
        }

    except Exception:
        db.rollback()
        raise


@router.post(
    "/tables/{qr_token}/orders",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
def create_public_order(
    qr_token: str,
    payload: OrderCreate,
    request: Request,
    db: Session = Depends(get_db),
    x_dining_session_token: str = Header(
        default="",
        alias="X-Dining-Session-Token",
    ),
):
    """Place an order associated with the current dining session."""

    table, branch, dining_session = get_valid_dining_session(
        qr_token,
        x_dining_session_token,
        db,
    )

    customer = None

    if payload.customer_id is not None:
        customer = (
            db.query(Customer)
            .filter(
                Customer.id == payload.customer_id,
                Customer.branch_id == branch.id,
            )
            .first()
        )

        if customer is None:
            raise HTTPException(
                status_code=422,
                detail="The selected customer was not found in this branch.",
            )

        customer_name = customer.name
        customer_number = customer.phone

    else:
        customer_name = payload.customer_name
        customer_number = payload.customer_number

    requested_ids = [item.dish_id for item in payload.items]

    dishes = (
        db.query(Dish)
        .filter(
            Dish.id.in_(requested_ids),
            Dish.branch_id == branch.id,
            Dish.is_available.is_(True),
        )
        .all()
    )

    dishes_by_id = {dish.id: dish for dish in dishes}

    if any(dish_id not in dishes_by_id for dish_id in requested_ids):
        raise HTTPException(
            status_code=422,
            detail=(
                "One or more selected dishes are unavailable. "
                "Refresh the menu and try again."
            ),
        )

    order_items: list[OrderItem] = []
    subtotal = Decimal("0.00")

    for requested_item in payload.items:
        dish = dishes_by_id[requested_item.dish_id]

        unit_price = money(Decimal(str(dish.price)))
        line_total = money(unit_price * requested_item.quantity)

        subtotal += line_total

        order_items.append(
            OrderItem(
                dish_id=dish.id,
                dish_name=dish.name,
                quantity=requested_item.quantity,
                unit_price=unit_price,
                line_total=line_total,
                special_instructions=requested_item.special_instructions,
                status="pending",
            )
        )

    subtotal = money(subtotal)

    order = Order(
        branch_id=branch.id,
        customer_id=customer.id if customer else None,
        table_id=table.id,
        table_number=table.table_number,
        dining_session_id=dining_session.id,
        status="pending",
        customer_name=customer_name,
        customer_number=customer_number,
        customer_note=payload.customer_note,
        subtotal=subtotal,
        total_amount=subtotal,
        items=order_items,
    )

    try:
        table.is_occupied = True

        db.add(order)
        db.commit()
        db.refresh(order)

        return (
            db.query(Order)
            .options(selectinload(Order.items))
            .filter(
                Order.id == order.id,
                Order.branch_id == branch.id,
            )
            .one()
        )

    except Exception:
        db.rollback()
        raise


@router.get(
    "/orders/{order_number}",
    response_model=PublicOrderStatusResponse,
)
@limiter.limit("30/minute")
def get_public_order_status(
    order_number: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Track an individual order using its order number."""

    order = (
        db.query(Order)
        .options(selectinload(Order.items))
        .filter(Order.order_number == order_number)
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found.",
        )

    return order


@router.get(
    "/tables/{qr_token}/orders",
    response_model=list[PublicOrderStatusResponse],
)
@limiter.limit("30/minute")
def get_active_table_orders(
    qr_token: str,
    request: Request,
    db: Session = Depends(get_db),
    x_dining_session_token: str = Header(
        default="",
        alias="X-Dining-Session-Token",
    ),
):
    """Return active orders belonging only to this dining session."""

    table, branch, dining_session = get_valid_dining_session(
        qr_token,
        x_dining_session_token,
        db,
    )

    recent_cutoff = datetime.now(timezone.utc) - timedelta(hours=8)

    return (
        db.query(Order)
        .options(selectinload(Order.items))
        .filter(
            Order.branch_id == branch.id,
            Order.table_id == table.id,
            Order.dining_session_id == dining_session.id,
            Order.created_at >= recent_cutoff,
            Order.status.in_(ACTIVE_ORDER_STATUSES),
        )
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(50)
        .all()
    )


@router.post(
    "/tables/{qr_token}/orders/{order_number}/items/{item_id}/cancel",
    response_model=PublicOrderStatusResponse,
)
@limiter.limit("10/minute")
def cancel_public_order_item(
    qr_token: str,
    order_number: str,
    item_id: int,
    request: Request,
    db: Session = Depends(get_db),
    x_dining_session_token: str = Header(
        default="",
        alias="X-Dining-Session-Token",
    ),
):
    """Cancel one pending item belonging to the current dining session."""

    table, branch, dining_session = get_valid_dining_session(
        qr_token,
        x_dining_session_token,
        db,
    )

    order = (
        db.query(Order)
        .options(selectinload(Order.items))
        .filter(
            Order.order_number == order_number,
            Order.branch_id == branch.id,
            Order.table_id == table.id,
            Order.dining_session_id == dining_session.id,
        )
        .with_for_update()
        .first()
    )

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found in this dining session.",
        )

    if order.status in {"completed", "cancelled"}:
        raise HTTPException(
            status_code=409,
            detail="This order is already closed.",
        )

    item = next(
        (entry for entry in order.items if entry.id == item_id),
        None,
    )

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Order item not found.",
        )

    if (item.status or "pending") != "pending":
        raise HTTPException(
            status_code=409,
            detail="Only pending items can be cancelled.",
        )

    try:
        item.status = "cancelled"
        item.status_updated_at = datetime.now(timezone.utc)

        remaining_total = money(
            sum(
                (
                    Decimal(str(entry.line_total))
                    for entry in order.items
                    if entry.status != "cancelled"
                ),
                Decimal("0.00"),
            )
        )

        order.subtotal = remaining_total
        order.total_amount = remaining_total

        statuses = [
            entry.status or "pending"
            for entry in order.items
        ]

        if all(value == "cancelled" for value in statuses):
            order.status = "cancelled"

        elif "preparing" in statuses:
            order.status = "preparing"

        elif "pending" in statuses:
            order.status = (
                "confirmed"
                if order.status == "confirmed"
                else "pending"
            )

        elif all(
            value in {"ready", "served", "cancelled"}
            for value in statuses
        ):
            if any(value == "ready" for value in statuses):
                order.status = "ready"

            elif any(value == "served" for value in statuses):
                order.status = "completed"

            else:
                order.status = "cancelled"

        order.updated_at = datetime.now(timezone.utc)

        recalculate_bill_for_order(
            db,
            order,
            cancelled_by="customer",
        )

        db.commit()

        return (
            db.query(Order)
            .options(selectinload(Order.items))
            .filter(Order.id == order.id)
            .one()
        )

    except Exception:
        db.rollback()
        raise


@router.post(
    "/tables/{qr_token}/orders/{order_number}/cancel",
    response_model=PublicOrderStatusResponse,
)
@limiter.limit("5/minute")
def cancel_public_order(
    qr_token: str,
    order_number: str,
    request: Request,
    db: Session = Depends(get_db),
    x_dining_session_token: str = Header(
        default="",
        alias="X-Dining-Session-Token",
    ),
):
    """Cancel the entire order only while its overall status is pending."""

    table, branch, dining_session = get_valid_dining_session(
        qr_token,
        x_dining_session_token,
        db,
    )

    order = (
        db.query(Order)
        .options(selectinload(Order.items))
        .filter(
            Order.order_number == order_number,
            Order.branch_id == branch.id,
            Order.table_id == table.id,
            Order.dining_session_id == dining_session.id,
        )
        .with_for_update()
        .first()
    )

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found in this dining session.",
        )

    if order.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=(
                "An order can only be cancelled while its "
                "overall status is pending."
            ),
        )

    now = datetime.now(timezone.utc)

    try:
        for item in order.items:
            if (item.status or "pending") == "pending":
                item.status = "cancelled"
                item.status_updated_at = now

        order.status = "cancelled"
        order.subtotal = Decimal("0.00")
        order.total_amount = Decimal("0.00")
        order.updated_at = now

        recalculate_bill_for_order(
            db,
            order,
            cancelled_by="customer",
        )

        db.commit()

        return (
            db.query(Order)
            .options(selectinload(Order.items))
            .filter(
                Order.id == order.id,
                Order.branch_id == branch.id,
            )
            .one()
        )

    except Exception:
        db.rollback()
        raise