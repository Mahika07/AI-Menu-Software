from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.table import RestaurantTable
from app.models.branch import Branch
from app.models.restaurant import Restaurant
from app.models.category import Category
from app.models.dish import Dish
from app.schemas.public_menu import PublicMenuResponse


router = APIRouter(
    prefix="/public",
    tags=["Public Menu"],
)


@router.get(
    "/menu/{qr_token}",
    response_model=PublicMenuResponse,
)
def get_public_menu(
    qr_token: str,
    db: Session = Depends(get_db),
):
    # Resolve the table from its QR token.
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
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu not found",
        )

    # Resolve the active branch.
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
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu not found",
        )

    # Resolve the restaurant.
    restaurant = (
        db.query(Restaurant)
        .filter(Restaurant.id == branch.restaurant_id)
        .first()
    )

    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu not found",
        )

    # Retrieve active categories for this branch.
    categories = (
        db.query(Category)
        .filter(
            Category.branch_id == branch.id,
            Category.is_active.is_(True),
        )
        .order_by(
            Category.display_order.asc(),
            Category.id.asc(),
        )
        .all()
    )

    result = []

    for category in categories:
        dishes = (
            db.query(Dish)
            .filter(
                Dish.category_id == category.id,
                Dish.branch_id == branch.id,
                Dish.is_available.is_(True),
            )
            .order_by(Dish.id.asc())
            .all()
        )

        result.append(
            {
                "id": category.id,
                "name": category.name,
                "description": category.description,
                "display_order": category.display_order,
                "dishes": dishes,
            }
        )

    return {
        "restaurant_name": restaurant.name,
        "logo_url": restaurant.logo_url,
        "branch_name": branch.name,
        "branch_id": branch.id,
        "table_id": table.id,
        "categories": result,
    }