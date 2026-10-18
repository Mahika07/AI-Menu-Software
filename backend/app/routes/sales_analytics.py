from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database.connection import get_db
from app.models.branch import Branch
from app.models.order import Order, OrderItem
from app.models.restaurant import Restaurant
from app.models.user import User


router = APIRouter(
    prefix="/sales-analytics",
    tags=["Sales Analytics"],
)


def money(value) -> float:
    return float(value or Decimal("0"))


@router.get("/branches/{branch_id}")
def get_sales_analytics(
    branch_id: int,
    days: int = Query(default=7, ge=7, le=90),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify that the branch belongs to the logged-in owner.
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

    # Use explicit dates when supplied; otherwise use the last N days.
    today = datetime.now(timezone.utc).date()
    selected_end = end_date or today
    selected_start = start_date or (
        selected_end - timedelta(days=days - 1)
    )

    if selected_start > selected_end:
        raise HTTPException(
            status_code=400,
            detail="start_date must be on or before end_date.",
        )

    if (selected_end - selected_start).days > 89:
        raise HTTPException(
            status_code=400,
            detail="Date range cannot exceed 90 days.",
        )

    start_datetime = datetime.combine(
        selected_start, time.min, tzinfo=timezone.utc
    )
    end_datetime = datetime.combine(
        selected_end + timedelta(days=1),
        time.min,
        tzinfo=timezone.utc,
    )

    base_filters = [
        Order.branch_id == branch.id,
        Order.created_at >= start_datetime,
        Order.created_at < end_datetime,
    ]

    # Count orders by status, including cancelled orders.
    status_rows = (
        db.query(Order.status, func.count(Order.id))
        .filter(*base_filters)
        .group_by(Order.status)
        .all()
    )

    status_breakdown = {
        status: count
        for status, count in status_rows
    }

    total_orders = sum(status_breakdown.values())
    cancelled_orders = status_breakdown.get("cancelled", 0)

    # Cancelled orders are excluded from revenue and average order value.
    eligible_filters = [
        *base_filters,
        Order.status != "cancelled",
    ]

    summary = (
        db.query(
            func.coalesce(func.sum(Order.total_amount), 0),
            func.count(Order.id),
            func.coalesce(func.avg(Order.total_amount), 0),
        )
        .filter(*eligible_filters)
        .one()
    )

    revenue, eligible_order_count, average_order_value = summary

    # Daily revenue and order counts.
    daily_rows = (
        db.query(
            func.date(Order.created_at).label("order_date"),
            func.coalesce(func.sum(Order.total_amount), 0).label("revenue"),
            func.count(Order.id).label("orders"),
        )
        .filter(*eligible_filters)
        .group_by(func.date(Order.created_at))
        .order_by(func.date(Order.created_at))
        .all()
    )

    daily_lookup = {
        str(row.order_date): {
            "revenue": money(row.revenue),
            "orders": row.orders,
        }
        for row in daily_rows
    }

    daily_revenue = []
    current_date = selected_start

    while current_date <= selected_end:
        key = current_date.isoformat()
        point = daily_lookup.get(
            key,
            {"revenue": 0.0, "orders": 0},
        )

        daily_revenue.append({
            "date": key,
            "revenue": point["revenue"],
            "orders": point["orders"],
        })

        current_date += timedelta(days=1)

    # Best-selling dishes by quantity, excluding cancelled orders.
    popular_rows = (
        db.query(
            OrderItem.dish_name,
            func.coalesce(func.sum(OrderItem.quantity), 0).label(
                "quantity_sold"
            ),
            func.coalesce(func.sum(OrderItem.line_total), 0).label(
                "sales"
            ),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .filter(*eligible_filters)
        .group_by(OrderItem.dish_name)
        .order_by(
            func.sum(OrderItem.quantity).desc(),
            func.sum(OrderItem.line_total).desc(),
        )
        .limit(10)
        .all()
    )

    popular_dishes = [
        {
            "dish_name": row.dish_name,
            "quantity_sold": int(row.quantity_sold),
            "sales": money(row.sales),
        }
        for row in popular_rows
    ]

    return {
        "branch_id": branch.id,
        "branch_name": branch.name,
        "start_date": selected_start.isoformat(),
        "end_date": selected_end.isoformat(),
        "total_revenue": money(revenue),
        "total_orders": total_orders,
        "eligible_orders": eligible_order_count,
        "cancelled_orders": cancelled_orders,
        "average_order_value": money(average_order_value),
        "daily_revenue": daily_revenue,
        "popular_dishes": popular_dishes,
        "status_breakdown": status_breakdown,
    }
