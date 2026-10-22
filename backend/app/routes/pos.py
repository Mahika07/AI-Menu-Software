
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.dependencies import get_current_user
from app.database.connection import get_db
from app.models.bill import Bill
from app.models.branch import Branch
from app.models.customer import Customer
from app.models.dish import Dish
from app.models.order import Order, OrderItem
from app.models.restaurant import Restaurant
from app.models.table import RestaurantTable
from app.models.user import User
from app.schemas.order import OwnerOrderResponse
from app.schemas.pos import POSOrderCreate


router = APIRouter(
    prefix="/branches/{branch_id}/pos",
    tags=["POS"],
)


def money(value: Decimal) -> Decimal:
    return value.quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )


def get_owned_branch(
    db: Session,
    branch_id: int,
    current_user: User,
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


def resolve_order_customer(
    db: Session,
    branch_id: int,
    customer_id: int | None,
    customer_name: str | None,
    customer_number: str | None,
) -> tuple[Customer | None, str | None, str | None]:
    """Resolve a customer only within the selected branch."""
    if customer_id is not None:
        customer = (
            db.query(Customer)
            .filter(
                Customer.id == customer_id,
                Customer.branch_id == branch_id,
            )
            .with_for_update()
            .first()
        )

        if customer is None:
            raise HTTPException(
                status_code=422,
                detail="The selected customer was not found in this branch.",
            )

        return customer, customer.name, customer.phone

    name = (
        customer_name.strip()
        if customer_name and customer_name.strip()
        else None
    )
    phone = (
        customer_number.strip()
        if customer_number and customer_number.strip()
        else None
    )

    if not phone:
        return None, name, None

    customer = (
        db.query(Customer)
        .filter(
            Customer.branch_id == branch_id,
            Customer.phone == phone,
        )
        .with_for_update()
        .first()
    )

    if customer is not None:
        if name and not customer.name.strip():
            customer.name = name

        return customer, customer.name, customer.phone

    customer = Customer(
        branch_id=branch_id,
        name=name or "Walk-in Customer",
        phone=phone,
    )

    db.add(customer)

    try:
        db.flush()
        return customer, customer.name, customer.phone

    except IntegrityError:
        db.rollback()

        customer = (
            db.query(Customer)
            .filter(
                Customer.branch_id == branch_id,
                Customer.phone == phone,
            )
            .first()
        )

        if customer is not None:
            return customer, customer.name, customer.phone

        raise HTTPException(
            status_code=409,
            detail="Unable to resolve this customer. Please retry the order.",
        )


@router.post(
    "/orders",
    response_model=OwnerOrderResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_pos_order(
    branch_id: int,
    payload: POSOrderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a staff order using server-side menu prices."""
    branch = get_owned_branch(db, branch_id, current_user)
    table = None

    try:
        customer, customer_name, customer_number = resolve_order_customer(
            db=db,
            branch_id=branch.id,
            customer_id=payload.customer_id,
            customer_name=payload.customer_name,
            customer_number=payload.customer_number,
        )

        if payload.table_id is not None:
            table = (
                db.query(RestaurantTable)
                .filter(
                    RestaurantTable.id == payload.table_id,
                    RestaurantTable.branch_id == branch.id,
                    RestaurantTable.is_active.is_(True),
                    RestaurantTable.is_unavailable.is_(False),
                    RestaurantTable.is_occupied.is_(False),
                )
                .with_for_update()
                .first()
            )

            if table is None:
                raise HTTPException(
                    status_code=422,
                    detail="The selected table is unavailable.",
                )

            outstanding_order = (
                db.query(Order.id)
                .outerjoin(
                    Bill,
                    and_(
                        Bill.order_id == Order.id,
                        Bill.branch_id == Order.branch_id,
                    ),
                )
                .filter(
                    Order.branch_id == branch.id,
                    Order.table_id == table.id,
                    or_(
                        and_(
                            Bill.id.is_not(None),
                            or_(
                                Bill.payment_status.is_(None),
                                Bill.payment_status != "paid",
                            ),
                        ),
                        and_(
                            Bill.id.is_(None),
                            Order.status.notin_(["completed", "cancelled"]),
                        ),
                    ),
                )
                .first()
            )

            if outstanding_order:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "This table is occupied. Its existing order must "
                        "have a bill marked as paid before reuse."
                    ),
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
                    "Refresh the POS menu and try again."
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
            table_id=table.id if table else None,
            table_number=table.table_number if table else "Takeaway",
            dining_session_id=None,
            status="pending",
            customer_name=customer_name,
            customer_number=customer_number,
            customer_note=payload.customer_note,
            subtotal=subtotal,
            total_amount=subtotal,
            items=order_items,
        )

        if table is not None:
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

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to create POS order.",
        )
