
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session, selectinload

from app.core.rate_limit import limiter
from app.database.connection import get_db
from app.models.branch import Branch
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
# expires_at is retained for schema compatibility; closure is staff-controlled.
SESSION_DURATION = timedelta(days=36500)
ACTIVE_ORDER_STATUSES = ["pending", "confirmed", "preparing", "ready"]


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def get_active_table_and_branch(
    qr_token: str,
    db: Session,
) -> tuple[RestaurantTable, Branch]:
    table = (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.qr_token == qr_token,
            RestaurantTable.is_active.is_(True),
        )
        .first()
    )

    if not table:
        raise HTTPException(
            status_code=404,
            detail="This table or its QR code is unavailable.",
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
            detail="Dining session missing. Refresh the menu to start a session.",
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
            detail="Invalid dining session. Refresh the menu to start a new session.",
        )

    if session.closed_at is not None:
        raise HTTPException(
            status_code=410,
            detail="This dining session is closed. Refresh the menu to start a new session.",
        )

    return table, branch, session


@router.post("/tables/{qr_token}/sessions", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def create_dining_session(
    qr_token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create a new private browser dining session for an active table."""
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
        unit_price = money(Decimal(dish.price))
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
        table_id=table.id,
        table_number=table.table_number,
        dining_session_id=dining_session.id,
        status="pending",
        customer_name=payload.customer_name,
        customer_note=payload.customer_note,
        subtotal=subtotal,
        total_amount=subtotal,
        items=order_items,
    )

    try:
        db.add(order)
        db.commit()
        db.refresh(order)

        return (
            db.query(Order)
            .options(selectinload(Order.items))
            .filter(Order.id == order.id)
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
    """Track an individual order using its unguessable order number."""
    order = (
        db.query(Order)
        .options(selectinload(Order.items))
        .filter(Order.order_number == order_number)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

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
    from sqlalchemy import select

    table, branch, dining_session = get_valid_dining_session(
        qr_token,
        x_dining_session_token,
        db,
    )

    # Lock the order while validating and changing the item.
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

        # Recalculate the amount from items that have not been cancelled.
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
