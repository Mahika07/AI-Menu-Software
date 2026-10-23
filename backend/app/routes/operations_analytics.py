from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database.connection import get_db
from app.models.bill import Bill
from app.models.branch import Branch
from app.models.expense import Expense
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.table import RestaurantTable
from app.models.user import User

router = APIRouter(tags=["Operations & Expenses"])


class ExpenseCreate(BaseModel):
    category: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=2, max_length=250)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    incurred_on: date
    notes: str | None = Field(default=None, max_length=4000)


class ExpenseUpdate(BaseModel):
    category: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, min_length=2, max_length=250)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    incurred_on: date | None = None
    notes: str | None = Field(default=None, max_length=4000)


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    branch_id: int
    created_by_user_id: int
    category: str
    description: str
    amount: Decimal
    incurred_on: date
    notes: str | None = None
    created_at: datetime


def owned_branch(db: Session, branch_id: int, user: User) -> Branch:
    branch = (
        db.query(Branch)
        .join(Restaurant, Restaurant.id == Branch.restaurant_id)
        .filter(Branch.id == branch_id, Restaurant.owner_id == user.id)
        .first()
    )
    if branch is None:
        raise HTTPException(status_code=404, detail="Branch not found.")
    return branch


def date_window(start_date: date | None, end_date: date | None):
    end = end_date or datetime.now(timezone.utc).date()
    start = start_date or end - timedelta(days=29)
    if start > end:
        raise HTTPException(status_code=422, detail="start_date cannot be after end_date.")
    if (end - start).days > 364:
        raise HTTPException(status_code=422, detail="Date range cannot exceed 365 days.")
    return start, end, datetime.combine(start, time.min, tzinfo=timezone.utc), datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc)



@router.get("/branches/{branch_id}/operations-analytics")
def get_operations_analytics(
    branch_id: int,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_branch(db, branch_id, current_user)
    start, end, start_dt, end_dt = date_window(start_date, end_date)

    tables = db.query(RestaurantTable).filter(
        RestaurantTable.branch_id == branch_id,
        RestaurantTable.is_active.is_(True),
    ).all()
    table_count = len(tables)
    unavailable_count = sum(1 for table in tables if table.is_unavailable)

    order_rows = (
        db.query(Order)
        .filter(Order.branch_id == branch_id, Order.created_at >= start_dt, Order.created_at < end_dt)
        .all()
    )
    completed_statuses = {"completed", "served", "paid", "closed"}
    active_statuses = {"pending", "confirmed", "preparing", "ready", "in_progress"}
    completed_orders = [o for o in order_rows if str(o.status).lower() in completed_statuses]
    active_orders = [o for o in order_rows if str(o.status).lower() in active_statuses]

    active_table_ids = {table.id for table in tables}
    tables_with_orders = {o.table_id for o in order_rows if o.table_id in active_table_ids}
    utilization_pct = round((len(tables_with_orders) / table_count) * 100, 2) if table_count else 0.0
    turnover = round(len(completed_orders) / table_count, 2) if table_count else 0.0

    durations = []
    for order in completed_orders:
        if order.created_at and order.updated_at:
            seconds = (order.updated_at - order.created_at).total_seconds()
            if 0 <= seconds <= 24 * 60 * 60:
                durations.append(seconds / 60)
    avg_completion_minutes = round(sum(durations) / len(durations), 2) if durations else None

    expense_rows = db.query(
        func.coalesce(func.sum(Expense.amount), 0),
        func.count(Expense.id),
    ).filter(
        Expense.branch_id == branch_id,
        Expense.incurred_on >= start,
        Expense.incurred_on <= end,
    ).one()
    expense_total = Decimal(str(expense_rows[0] or 0))

    paid_revenue = db.query(func.coalesce(func.sum(Bill.total_amount), 0)).filter(
        Bill.branch_id == branch_id,
        Bill.payment_status == "paid",
        Bill.paid_at.isnot(None),
        Bill.paid_at >= start_dt,
        Bill.paid_at < end_dt,
    ).scalar() or 0

    # This is an operating contribution estimate only: expenses entered in the
    # system are subtracted from paid bills; food/inventory costs are not included.
    return {
        "branch_id": branch_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "table_count": table_count,
        "unavailable_table_count": unavailable_count,
        "tables_used": len(tables_with_orders),
        "table_utilization_percent": utilization_pct,
        "table_turnover_per_table": turnover,
        "orders_count": len(order_rows),
        "completed_orders": len(completed_orders),
        "active_orders": len(active_orders),
        "average_create_to_last_update_minutes": avg_completion_minutes,
        "paid_revenue": float(Decimal(str(paid_revenue or 0))),
        "recorded_expenses": float(expense_total),
        "expense_count": int(expense_rows[1] or 0),
        "estimated_contribution_after_recorded_expenses": float(Decimal(str(paid_revenue or 0)) - expense_total),
        "profit_note": "Estimate excludes food/inventory costs, payroll not entered as expenses, and other unrecorded costs.",
    }


@router.get("/branches/{branch_id}/expenses", response_model=list[ExpenseResponse])
def list_expenses(
    branch_id: int,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_branch(db, branch_id, current_user)
    query = db.query(Expense).filter(Expense.branch_id == branch_id)
    if start_date:
        query = query.filter(Expense.incurred_on >= start_date)
    if end_date:
        query = query.filter(Expense.incurred_on <= end_date)
    return query.order_by(Expense.incurred_on.desc(), Expense.id.desc()).all()


@router.post("/branches/{branch_id}/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_expense(
    branch_id: int,
    payload: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_branch(db, branch_id, current_user)
    expense = Expense(
        branch_id=branch_id,
        created_by_user_id=current_user.id,
        category=payload.category.strip(),
        description=payload.description.strip(),
        amount=payload.amount,
        incurred_on=payload.incurred_on,
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.patch("/branches/{branch_id}/expenses/{expense_id}", response_model=ExpenseResponse)
def update_expense(
    branch_id: int,
    expense_id: int,
    payload: ExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_branch(db, branch_id, current_user)
    expense = db.query(Expense).filter(Expense.id == expense_id, Expense.branch_id == branch_id).first()
    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is None and key != "notes":
            raise HTTPException(status_code=422, detail=f"{key} cannot be null.")
        if key in {"category", "description"} and isinstance(value, str):
            value = value.strip()
            if not value:
                raise HTTPException(status_code=422, detail=f"{key} cannot be blank.")
        if key == "notes" and isinstance(value, str):
            value = value.strip() or None
        setattr(expense, key, value)
    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/branches/{branch_id}/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    branch_id: int,
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_branch(db, branch_id, current_user)
    expense = db.query(Expense).filter(Expense.id == expense_id, Expense.branch_id == branch_id).first()
    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found.")
    db.delete(expense)
    db.commit()
