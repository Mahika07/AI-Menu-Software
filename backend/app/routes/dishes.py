from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.core.dependencies import get_current_user

from app.models.user import User
from app.models.branch import Branch
from app.models.restaurant import Restaurant
from app.models.category import Category
from app.models.dish import Dish

from app.schemas.dish import (
    DishCreate,
    DishUpdate,
    DishResponse,
)


router = APIRouter(
    prefix="/branches/{branch_id}/dishes",
    tags=["Dishes"],
)


def get_owned_branch(
    branch_id: int,
    current_user: User,
    db: Session,
):
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

    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )

    if not branch.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Branch is inactive",
        )

    return branch


def get_owned_category(
    category_id: int,
    branch_id: int,
    current_user: User,
    db: Session,
):
    get_owned_branch(
        branch_id,
        current_user,
        db,
    )

    category = (
        db.query(Category)
        .filter(
            Category.id == category_id,
            Category.branch_id == branch_id,
        )
        .first()
    )

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    if not category.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category is inactive",
        )

    return category


@router.post(
    "",
    response_model=DishResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_dish(
    branch_id: int,
    dish_data: DishCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # category_id now comes from the JSON body
    get_owned_category(
        category_id=dish_data.category_id,
        branch_id=branch_id,
        current_user=current_user,
        db=db,
    )

    dish = Dish(
        branch_id=branch_id,
        category_id=dish_data.category_id,
        name=dish_data.name.strip(),
        description=(
            dish_data.description.strip()
            if dish_data.description
            else None
        ),
        price=dish_data.price,
        image_url=(
            dish_data.image_url.strip()
            if dish_data.image_url
            else None
        ),
        ingredients=(
            dish_data.ingredients.strip()
            if dish_data.ingredients
            else None
        ),
        spice_level=dish_data.spice_level,
        dietary_type=dish_data.dietary_type,
        allergens=(
            dish_data.allergens.strip()
            if dish_data.allergens
            else None
        ),
        serving_size=(
            dish_data.serving_size.strip()
            if dish_data.serving_size
            else None
        ),
        is_available=True,
    )

    try:
        db.add(dish)
        db.commit()
        db.refresh(dish)

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create dish.",
        )

    return dish


@router.get(
    "",
    response_model=list[DishResponse],
)
def get_dishes(
    branch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_branch(
        branch_id,
        current_user,
        db,
    )

    return (
        db.query(Dish)
        .filter(
            Dish.branch_id == branch_id
        )
        .order_by(
            Dish.id.asc()
        )
        .all()
    )


@router.get(
    "/{dish_id}",
    response_model=DishResponse,
)
def get_dish(
    branch_id: int,
    dish_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_branch(
        branch_id,
        current_user,
        db,
    )

    dish = (
        db.query(Dish)
        .filter(
            Dish.id == dish_id,
            Dish.branch_id == branch_id,
        )
        .first()
    )

    if not dish:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dish not found",
        )

    return dish


@router.put(
    "/{dish_id}",
    response_model=DishResponse,
)
def update_dish(
    branch_id: int,
    dish_id: int,
    dish_data: DishUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_branch(
        branch_id,
        current_user,
        db,
    )

    dish = (
        db.query(Dish)
        .filter(
            Dish.id == dish_id,
            Dish.branch_id == branch_id,
        )
        .first()
    )

    if not dish:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dish not found",
        )

    update_data = dish_data.model_dump(
        exclude_unset=True
    )

    # If category is being changed,
    # verify that the new category belongs
    # to this branch and this owner.
    if "category_id" in update_data:
        get_owned_category(
            category_id=update_data["category_id"],
            branch_id=branch_id,
            current_user=current_user,
            db=db,
        )

    # Clean string fields
    string_fields = {
        "name",
        "description",
        "image_url",
        "ingredients",
        "allergens",
        "serving_size",
    }

    for field in string_fields:
        if field in update_data:
            value = update_data[field]

            if value is not None:
                update_data[field] = value.strip()

    for field, value in update_data.items():
        setattr(
            dish,
            field,
            value,
        )

    try:
        db.commit()
        db.refresh(dish)

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update dish.",
        )

    return dish


@router.delete(
    "/{dish_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_dish(
    branch_id: int,
    dish_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_branch(
        branch_id,
        current_user,
        db,
    )

    dish = (
        db.query(Dish)
        .filter(
            Dish.id == dish_id,
            Dish.branch_id == branch_id,
        )
        .first()
    )

    if not dish:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dish not found",
        )

    try:
        db.delete(dish)
        db.commit()

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete dish.",
        )

    return None
