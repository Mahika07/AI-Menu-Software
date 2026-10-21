
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.dependencies import get_current_user
from app.database.connection import get_db
from app.models.bill import Bill
from app.models.branch import Branch
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.user import User
from app.schemas.bill import BillCreate, BillResponse
from app.schemas.bill_payment import BillPaymentCreate, BillPaymentResponse


router = APIRouter(
    prefix="/branches/{branch_id}/bills",
    tags=["Bills"],
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


def bill_query(db: Session):
    return db.query(Bill).options(
        selectinload(Bill.order).selectinload(Order.items),
        joinedload(Bill.branch).joinedload(Branch.restaurant),
    )


def bill_payload(bill: Bill) -> dict:
    branch = bill.branch
    restaurant = branch.restaurant

    return {
        "id": bill.id,
        "bill_number": bill.bill_number,
        "order_id": bill.order_id,
        "branch_id": bill.branch_id,
        "subtotal": bill.subtotal,
        "discount_amount": bill.discount_amount,
        "tax_amount": bill.tax_amount,
        "total_amount": bill.total_amount,
        "payment_status": bill.payment_status,
        "payment_method": bill.payment_method,
        "paid_at": bill.paid_at,
        "created_at": bill.created_at,
        "order": bill.order,
        "branch_name": branch.name,
        "restaurant_name": restaurant.name,
    }


@router.get("", response_model=list[BillResponse])
def list_bills(
    branch_id: int,
    limit: int = Query(default=100, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_branch(db, branch_id, current_user)

    bills = (
        bill_query(db)
        .filter(Bill.branch_id == branch_id)
        .order_by(Bill.created_at.desc(), Bill.id.desc())
        .limit(limit)
        .all()
    )

    return [bill_payload(bill) for bill in bills]




@router.get("/paginated")
def list_bills_paginated(
    branch_id: int,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, max_length=100),
    payment_status: str | None = Query(default=None, max_length=20),
    payment_method: str | None = Query(default=None, max_length=30),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return searchable, date-filtered bill history for an owned branch."""
    get_owned_branch(db, branch_id, current_user)

    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="start_date cannot be after end_date.",
        )

    query = db.query(Bill).filter(Bill.branch_id == branch_id)

    # Search bill number, order number, or customer name.
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.join(Order, Bill.order_id == Order.id).filter(
            (Bill.bill_number.ilike(term))
            | (Order.order_number.ilike(term))
            | (Order.customer_name.ilike(term))
        )

    # Payment status.
    if payment_status and payment_status.lower() != "all":
        query = query.filter(
            Bill.payment_status == payment_status.strip().lower()
        )

    # Payment method.
    if payment_method and payment_method.lower() != "all":
        query = query.filter(
            func.lower(Bill.payment_method)
            == payment_method.strip().lower()
        )

    # Bill creation date range, interpreted as UTC.
    if start_date:
        start_datetime = datetime.combine(
            start_date,
            time.min,
            tzinfo=timezone.utc,
        )
        query = query.filter(Bill.created_at >= start_datetime)

    if end_date:
        end_datetime = datetime.combine(
            end_date + timedelta(days=1),
            time.min,
            tzinfo=timezone.utc,
        )
        query = query.filter(Bill.created_at < end_datetime)

    total = query.with_entities(func.count(Bill.id)).scalar() or 0

    matching_ids = query.with_entities(Bill.id)

    bills = (
        bill_query(db)
        .filter(Bill.id.in_(matching_ids))
        .order_by(Bill.created_at.desc(), Bill.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "items": [bill_payload(bill) for bill in bills],
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(bills) < total,
    }

# Keep this route before /{bill_id} for clarity and predictable routing.
@router.get("/analytics/summary")
def get_bill_analytics(
    branch_id: int,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return billing and collection analytics for an owned branch.

    Date filters apply to bill creation dates. Date boundaries are treated
    as UTC and use a half-open interval so the entire end date is included.
    If omitted, all bill records for the branch are included.
    """
    get_owned_branch(db, branch_id, current_user)

    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="start_date cannot be after end_date.",
        )

    query = db.query(Bill).filter(Bill.branch_id == branch_id)

    if start_date:
        start_datetime = datetime.combine(
            start_date,
            time.min,
            tzinfo=timezone.utc,
        )
        query = query.filter(Bill.created_at >= start_datetime)

    if end_date:
        # Exclusive next-day boundary includes every time on end_date.
        end_datetime = datetime.combine(
            end_date + timedelta(days=1),
            time.min,
            tzinfo=timezone.utc,
        )
        query = query.filter(Bill.created_at < end_datetime)

    paid_condition = Bill.payment_status == "paid"
    refunded_condition = Bill.payment_status == "refunded"
    outstanding_condition = Bill.payment_status.notin_(["paid", "refunded"])

    # Calculate headline metrics in one aggregate query.
    totals = query.with_entities(
        func.count(Bill.id).label("bill_count"),
        func.coalesce(
            func.sum(Bill.total_amount), 0
        ).label("total_billed"),
        func.coalesce(
            func.sum(
                case((paid_condition, Bill.total_amount), else_=0)
            ),
            0,
        ).label("paid_amount"),
        func.coalesce(
            func.sum(
                case((outstanding_condition, Bill.total_amount), else_=0)
            ),
            0,
        ).label("outstanding_amount"),
        func.sum(
            case((paid_condition, 1), else_=0)
        ).label("paid_count"),
        func.sum(
            case((outstanding_condition, 1), else_=0)
        ).label("unpaid_count"),
        func.sum(
            case((refunded_condition, 1), else_=0)
        ).label("refunded_count"),
    ).first()

    # Payment-method breakdown includes paid bills only.
    method_rows = (
        query.filter(paid_condition)
        .with_entities(
            Bill.payment_method.label("method"),
            func.count(Bill.id).label("bill_count"),
            func.coalesce(
                func.sum(Bill.total_amount), 0
            ).label("amount"),
        )
        .group_by(Bill.payment_method)
        .order_by(Bill.payment_method)
        .all()
    )

    payment_methods = [
        {
            "method": method or "unspecified",
            "bill_count": int(count or 0),
            "amount": float(money(Decimal(str(amount or 0)))),
        }
        for method, count, amount in method_rows
    ]

    # Daily billed and collected totals use the same date-filtered query.
    daily_rows = (
        query.with_entities(
            func.date(Bill.created_at).label("bill_date"),
            func.count(Bill.id).label("bill_count"),
            func.coalesce(
                func.sum(Bill.total_amount), 0
            ).label("total_billed"),
            func.coalesce(
                func.sum(
                    case((paid_condition, Bill.total_amount), else_=0)
                ),
                0,
            ).label("paid_amount"),
        )
        .group_by(func.date(Bill.created_at))
        .order_by(func.date(Bill.created_at))
        .all()
    )

    daily_totals = [
        {
            "date": str(row.bill_date),
            "bill_count": int(row.bill_count or 0),
            "total_billed": float(
                money(Decimal(str(row.total_billed or 0)))
            ),
            "paid_amount": float(
                money(Decimal(str(row.paid_amount or 0)))
            ),
        }
        for row in daily_rows
    ]

    total_billed = Decimal(str(totals.total_billed or 0))
    paid_amount = Decimal(str(totals.paid_amount or 0))
    outstanding_amount = Decimal(str(totals.outstanding_amount or 0))

    return {
        "branch_id": branch_id,
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "bill_count": int(totals.bill_count or 0),
        "paid_count": int(totals.paid_count or 0),
        "unpaid_count": int(totals.unpaid_count or 0),
        "refunded_count": int(totals.refunded_count or 0),
        "total_billed": float(money(total_billed)),
        "paid_amount": float(money(paid_amount)),
        "outstanding_amount": float(money(outstanding_amount)),
        "payment_methods": payment_methods,
        "daily_totals": daily_totals,
    }


@router.get("/{bill_id}", response_model=BillResponse)
def get_bill(
    branch_id: int,
    bill_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_branch(db, branch_id, current_user)

    bill = (
        bill_query(db)
        .filter(
            Bill.id == bill_id,
            Bill.branch_id == branch_id,
        )
        .first()
    )

    if bill is None:
        raise HTTPException(
            status_code=404,
            detail="Bill not found.",
        )

    return bill_payload(bill)


@router.post(
    "/orders/{order_id}",
    response_model=BillResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_bill(
    branch_id: int,
    order_id: int,
    payload: BillCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_branch(db, branch_id, current_user)

    order = (
        db.query(Order)
        .filter(
            Order.id == order_id,
            Order.branch_id == branch_id,
        )
        .with_for_update()
        .first()
    )

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found.",
        )

    existing_bill = (
        db.query(Bill)
        .filter(Bill.order_id == order.id)
        .first()
    )

    if existing_bill:
        raise HTTPException(
            status_code=409,
            detail="A bill already exists for this order.",
        )

    subtotal = money(Decimal(str(order.subtotal)))
    discount = money(payload.discount_amount)

    if discount > subtotal:
        raise HTTPException(
            status_code=422,
            detail="Discount cannot exceed the subtotal.",
        )

    taxable_amount = subtotal - discount
    tax = money(
        taxable_amount * payload.tax_rate / Decimal("100")
    )
    total = money(taxable_amount + tax)

    bill = Bill(
        bill_number=f"BILL-{uuid.uuid4().hex[:12].upper()}",
        order_id=order.id,
        branch_id=branch_id,
        subtotal=subtotal,
        discount_amount=discount,
        tax_amount=tax,
        total_amount=total,
        payment_status="unpaid",
    )

    db.add(bill)

    try:
        db.commit()
        db.refresh(bill)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Unable to create bill. A bill may already exist for this order.",
        )

    saved_bill = (
        bill_query(db)
        .filter(Bill.id == bill.id)
        .first()
    )

    return bill_payload(saved_bill)


@router.patch(
    "/{bill_id}/payment",
    response_model=BillPaymentResponse,
)
def mark_bill_paid(
    branch_id: int,
    bill_id: int,
    payload: BillPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_branch(db, branch_id, current_user)

    bill = (
        db.query(Bill)
        .filter(
            Bill.id == bill_id,
            Bill.branch_id == branch_id,
        )
        .with_for_update()
        .first()
    )

    if bill is None:
        raise HTTPException(
            status_code=404,
            detail="Bill not found.",
        )

    # Only an outstanding bill can transition to paid. In particular, a
    # refunded bill must never be silently converted back to paid.
    if bill.payment_status == "paid":
        raise HTTPException(
            status_code=409,
            detail="This bill has already been marked as paid.",
        )

    if bill.payment_status not in {"unpaid", "pending"}:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A bill with payment status '{bill.payment_status}' "
                "cannot be marked as paid."
            ),
        )

    # This endpoint records a staff-confirmed, offline payment (cash, UPI,
    # card, or other). It does not verify settlement with a payment provider.
    bill.payment_status = "paid"
    bill.payment_method = payload.payment_method
    bill.paid_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(bill)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to record payment.",
        )

    return bill
