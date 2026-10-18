from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database.connection import get_db

from app.models.user import User
from app.models.restaurant import Restaurant
from app.models.branch import Branch
from app.models.category import Category
from app.models.dish import Dish
from app.models.table import RestaurantTable

from app.schemas.dashboard import DashboardStats


router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)


@router.get(
    "/stats",
    response_model=DashboardStats,
)
def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    restaurant_count = (
        db.query(func.count(Restaurant.id))
        .filter(
            Restaurant.owner_id == current_user.id
        )
        .scalar()
        or 0
    )

    branch_count = (
        db.query(func.count(Branch.id))
        .join(
            Restaurant,
            Branch.restaurant_id == Restaurant.id,
        )
        .filter(
            Restaurant.owner_id == current_user.id
        )
        .scalar()
        or 0
    )

    category_count = (
        db.query(func.count(Category.id))
        .join(
            Branch,
            Category.branch_id == Branch.id,
        )
        .join(
            Restaurant,
            Branch.restaurant_id == Restaurant.id,
        )
        .filter(
            Restaurant.owner_id == current_user.id
        )
        .scalar()
        or 0
    )

    dish_count = (
        db.query(func.count(Dish.id))
        .join(
            Branch,
            Dish.branch_id == Branch.id,
        )
        .join(
            Restaurant,
            Branch.restaurant_id == Restaurant.id,
        )
        .filter(
            Restaurant.owner_id == current_user.id
        )
        .scalar()
        or 0
    )

    available_dish_count = (
        db.query(func.count(Dish.id))
        .join(
            Branch,
            Dish.branch_id == Branch.id,
        )
        .join(
            Restaurant,
            Branch.restaurant_id == Restaurant.id,
        )
        .filter(
            Restaurant.owner_id == current_user.id,
            Dish.is_available.is_(True),
        )
        .scalar()
        or 0
    )

    table_count = (
        db.query(func.count(RestaurantTable.id))
        .join(
            Branch,
            RestaurantTable.branch_id == Branch.id,
        )
        .join(
            Restaurant,
            Branch.restaurant_id == Restaurant.id,
        )
        .filter(
            Restaurant.owner_id == current_user.id
        )
        .scalar()
        or 0
    )

    return DashboardStats(
        restaurants=restaurant_count,
        branches=branch_count,
        categories=category_count,
        dishes=dish_count,
        available_dishes=available_dish_count,
        tables=table_count,
    )