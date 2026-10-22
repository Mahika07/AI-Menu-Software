from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.dependencies import get_current_user
from app.database.connection import get_db
from app.models.bill import Bill
from app.models.branch import Branch
from app.models.customer import Customer
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.user import User
from app.schemas.customer import (
    CustomerCreate,
    CustomerResponse,
    CustomerUpdate,
)


router = APIRouter(
    prefix="/branches/{branch_id}/customers",
    tags=["Customers"],
)


def get_owned_branch(
    branch_id: int,
    current_user: User,
    db: Session,
) -> Branch:
    branch = (
        db.query(Branch)
        .join(Restaurant, Restaurant.id == Branch.restaurant_id)
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


def normalize_phone(phone: str) -> str:
    return phone.strip()


def link_historical_orders(
    db: Session,
    branch_id: int,
    customer: Customer,
) -> None:
    """
    Link unassociated historical orders to a customer by exact phone
    number, restricted to the same branch.
    """
    if not customer.phone:
        return

    (
        db.query(Order)
        .filter(
            Order.branch_id == branch_id,
            Order.customer_id.is_(None),
            Order.customer_number == customer.phone,
        )
        .update(
            {Order.customer_id: customer.id},
            synchronize_session=False,
        )
    )


def get_or_create_customer_from_order(
    db: Session,
    branch_id: int,
    phone: str,
) -> Customer | None:
    """
    Find or create a saved customer for a historical order phone.
    The caller must already have verified branch ownership.
    """
    phone = normalize_phone(phone)

    if not phone:
        return None

    customer = (
        db.query(Customer)
        .filter(
            Customer.branch_id == branch_id,
            Customer.phone == phone,
        )
        .first()
    )

    if customer is None:
        historical_order = (
            db.query(Order)
            .filter(
                Order.branch_id == branch_id,
                Order.customer_number == phone,
                Order.customer_name.is_not(None),
            )
            .order_by(Order.created_at.asc(), Order.id.asc())
            .first()
        )

        if historical_order is None:
            return None

        customer_name = (
            historical_order.customer_name.strip()
            if historical_order.customer_name
            else ""
        )

        customer = Customer(
            branch_id=branch_id,
            name=customer_name or "Customer",
            phone=phone,
        )

        db.add(customer)

        try:
            db.flush()
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

            if customer is None:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Unable to resolve this customer. "
                        "Please retry."
                    ),
                )

    link_historical_orders(db, branch_id, customer)
    return customer


@router.post(
    "",
    response_model=CustomerResponse,
    status_code=201,
)
def create_customer(
    branch_id: int,
    payload: CustomerCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(branch_id, current_user, db)
    phone = normalize_phone(payload.phone)

    existing = (
        db.query(Customer)
        .filter(
            Customer.branch_id == branch.id,
            Customer.phone == phone,
        )
        .first()
    )

    if existing is not None:
        link_historical_orders(db, branch.id, existing)

        try:
            db.commit()
            db.refresh(existing)
            return existing
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail="Unable to update customer order links.",
            )

    customer = Customer(
        branch_id=branch.id,
        name=payload.name,
        phone=phone,
        email=str(payload.email) if payload.email else None,
        notes=payload.notes,
    )

    try:
        db.add(customer)
        db.flush()
        link_historical_orders(db, branch.id, customer)
        db.commit()
        db.refresh(customer)
        return customer

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                "A customer with this mobile number already "
                "exists in this branch."
            ),
        )

    except Exception:
        db.rollback()
        raise


@router.get("", response_model=list[CustomerResponse])
def list_customers(
    branch_id: int,
    search: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(branch_id, current_user, db)

    query = db.query(Customer).filter(
        Customer.branch_id == branch.id,
    )

    term = search.strip() if search else ""

    if term:
        pattern = f"%{term}%"

        # Search saved customers and matching unlinked historical orders.
        matching_orders = (
            db.query(Order.customer_number)
            .filter(
                Order.branch_id == branch.id,
                Order.customer_id.is_(None),
                Order.customer_number.is_not(None),
                or_(
                    Order.customer_name.ilike(pattern),
                    Order.customer_number.ilike(pattern),
                ),
            )
            .distinct()
            .all()
        )

        historical_phones = [
            row[0]
            for row in matching_orders
            if row[0] and row[0].strip()
        ]

        if historical_phones:
            for phone in historical_phones:
                get_or_create_customer_from_order(
                    db,
                    branch.id,
                    phone,
                )

            db.commit()

            # Rebuild query after importing matching historical customers.
            query = db.query(Customer).filter(
                Customer.branch_id == branch.id,
            )

        query = query.filter(
            or_(
                Customer.name.ilike(pattern),
                Customer.phone.ilike(pattern),
                Customer.email.ilike(pattern),
            )
        )

    return (
        query.order_by(Customer.name.asc(), Customer.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(
    branch_id: int,
    customer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(branch_id, current_user, db)

    customer = (
        db.query(Customer)
        .filter(
            Customer.id == customer_id,
            Customer.branch_id == branch.id,
        )
        .first()
    )

    if customer is None:
        raise HTTPException(
            status_code=404,
            detail="Customer not found.",
        )

    return customer


@router.patch("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    branch_id: int,
    customer_id: int,
    payload: CustomerUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(branch_id, current_user, db)

    customer = (
        db.query(Customer)
        .filter(
            Customer.id == customer_id,
            Customer.branch_id == branch.id,
        )
        .first()
    )

    if customer is None:
        raise HTTPException(
            status_code=404,
            detail="Customer not found.",
        )

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one field to update.",
        )

    if "name" in changes and changes["name"] is None:
        raise HTTPException(
            status_code=422,
            detail="Customer name cannot be null.",
        )

    if "phone" in changes and changes["phone"] is None:
        raise HTTPException(
            status_code=422,
            detail="Customer mobile number cannot be null.",
        )

    if "phone" in changes:
        changes["phone"] = normalize_phone(changes["phone"])

    for field, value in changes.items():
        if field == "email" and value is not None:
            value = str(value)

        setattr(customer, field, value)

    try:
        db.commit()
        db.refresh(customer)
        return customer

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                "A customer with this mobile number already "
                "exists in this branch."
            ),
        )

    except Exception:
        db.rollback()
        raise


@router.get("/{customer_id}/history")
def get_customer_history(
    branch_id: int,
    customer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a customer's orders and bills for this branch."""

    branch = get_owned_branch(
        branch_id,
        current_user,
        db,
    )

    customer = (
        db.query(Customer)
        .filter(
            Customer.id == customer_id,
            Customer.branch_id == branch.id,
        )
        .first()
    )

    if customer is None:
        raise HTTPException(
            status_code=404,
            detail="Customer not found.",
        )

    # Repair any historical links whenever customer history is opened.
    try:
        link_historical_orders(db, branch.id, customer)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to link historical customer orders.",
        )

    orders = (
        db.query(Order)
        .options(selectinload(Order.items))
        .filter(
            Order.branch_id == branch.id,
            Order.customer_id == customer.id,
        )
        .order_by(Order.created_at.desc(), Order.id.desc())
        .all()
    )

    order_ids = [order.id for order in orders]

    bills = []

    if order_ids:
        bills = (
            db.query(Bill)
            .filter(
                Bill.branch_id == branch.id,
                Bill.order_id.in_(order_ids),
            )
            .order_by(Bill.created_at.desc(), Bill.id.desc())
            .all()
        )

    bills_by_order_id = {
        bill.order_id: bill for bill in bills
    }

    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "email": customer.email,
        },
        "orders": [
            {
                "id": order.id,
                "order_number": order.order_number,
                "created_at": order.created_at,
                "status": order.status,
                "table_number": order.table_number,
                "subtotal": order.subtotal,
                "total_amount": order.total_amount,
                "items": [
                    {
                        "dish_name": item.dish_name,
                        "quantity": item.quantity,
                        "unit_price": item.unit_price,
                        "line_total": item.line_total,
                        "status": item.status,
                    }
                    for item in order.items
                ],
                "bill": (
                    {
                        "id": bills_by_order_id[order.id].id,
                        "bill_number": bills_by_order_id[
                            order.id
                        ].bill_number,
                        "payment_status": bills_by_order_id[
                            order.id
                        ].payment_status,
                        "payment_method": bills_by_order_id[
                            order.id
                        ].payment_method,
                        "subtotal": bills_by_order_id[
                            order.id
                        ].subtotal,
                        "discount_amount": bills_by_order_id[
                            order.id
                        ].discount_amount,
                        "tax_amount": bills_by_order_id[
                            order.id
                        ].tax_amount,
                        "total_amount": bills_by_order_id[
                            order.id
                        ].total_amount,
                        "paid_at": bills_by_order_id[
                            order.id
                        ].paid_at,
                    }
                    if order.id in bills_by_order_id
                    else None
                ),
            }
            for order in orders
        ],
        "total_orders": len(orders),
        "total_bills": len(bills),
    }
