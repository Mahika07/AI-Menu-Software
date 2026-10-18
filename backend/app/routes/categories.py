from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.core.dependencies import get_current_user

from app.models.user import User
from app.models.branch import Branch
from app.models.restaurant import Restaurant
from app.models.category import Category

from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
)

router = APIRouter(
    prefix="/branches/{branch_id}/categories",
    tags=["Categories"]
)


def get_owned_branch(
    branch_id: int,
    current_user: User,
    db: Session
):
    branch = (
        db.query(Branch)
        .join(Restaurant, Restaurant.id == Branch.restaurant_id)
        .filter(
            Branch.id == branch_id,
            Restaurant.owner_id == current_user.id
        )
        .first()
    )

    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found"
        )

    return branch


@router.post(
    "",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED
)
def create_category(
    branch_id: int,
    category_data: CategoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_owned_branch(branch_id, current_user, db)

    category = Category(
        branch_id=branch_id,
        name=category_data.name,
        description=category_data.description,
        display_order=category_data.display_order
    )

    db.add(category)
    db.commit()
    db.refresh(category)

    return category


@router.get("", response_model=list[CategoryResponse])
def get_categories(
    branch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_owned_branch(branch_id, current_user, db)

    return (
        db.query(Category)
        .filter(Category.branch_id == branch_id)
        .order_by(Category.display_order.asc(), Category.id.asc())
        .all()
    )


@router.get("/{category_id}", response_model=CategoryResponse)
def get_category(
    branch_id: int,
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_owned_branch(branch_id, current_user, db)

    category = (
        db.query(Category)
        .filter(
            Category.id == category_id,
            Category.branch_id == branch_id
        )
        .first()
    )

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )

    return category


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    branch_id: int,
    category_id: int,
    category_data: CategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_owned_branch(branch_id, current_user, db)

    category = (
        db.query(Category)
        .filter(
            Category.id == category_id,
            Category.branch_id == branch_id
        )
        .first()
    )

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )

    update_data = category_data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(category, field, value)

    db.commit()
    db.refresh(category)

    return category


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_category(
    branch_id: int,
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_owned_branch(branch_id, current_user, db)

    category = (
        db.query(Category)
        .filter(
            Category.id == category_id,
            Category.branch_id == branch_id
        )
        .first()
    )

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )

    db.delete(category)
    db.commit()

    return None