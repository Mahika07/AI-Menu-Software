from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.restaurant import Restaurant
from app.models.branch import Branch
from app.services.order_history import branch_has_order_history
from app.schemas.branch import (
    BranchCreate,
    BranchUpdate,
    BranchResponse,
)


router = APIRouter(
    prefix="/restaurants/{restaurant_id}/branches",
    tags=["Branches"],
)


def get_owned_restaurant(
    restaurant_id: int,
    current_user: User,
    db: Session,
):
    restaurant = (
        db.query(Restaurant)
        .filter(
            Restaurant.id == restaurant_id,
            Restaurant.owner_id == current_user.id,
        )
        .first()
    )

    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found",
        )

    return restaurant


@router.post(
    "",
    response_model=BranchResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_branch(
    restaurant_id: int,
    branch_data: BranchCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_restaurant(restaurant_id, current_user, db)

    branch = Branch(
        restaurant_id=restaurant_id,
        name=branch_data.name,
        address=branch_data.address,
        phone=branch_data.phone,
    )

    db.add(branch)
    db.commit()
    db.refresh(branch)

    return branch


@router.get("", response_model=list[BranchResponse])
def get_branches(
    restaurant_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_restaurant(restaurant_id, current_user, db)

    return (
        db.query(Branch)
        .filter(Branch.restaurant_id == restaurant_id)
        .all()
    )


@router.get("/{branch_id}", response_model=BranchResponse)
def get_branch(
    restaurant_id: int,
    branch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_restaurant(restaurant_id, current_user, db)

    branch = (
        db.query(Branch)
        .filter(
            Branch.id == branch_id,
            Branch.restaurant_id == restaurant_id,
        )
        .first()
    )

    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )

    return branch


@router.put("/{branch_id}", response_model=BranchResponse)
def update_branch(
    restaurant_id: int,
    branch_id: int,
    branch_data: BranchUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_restaurant(restaurant_id, current_user, db)

    branch = (
        db.query(Branch)
        .filter(
            Branch.id == branch_id,
            Branch.restaurant_id == restaurant_id,
        )
        .first()
    )

    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )

    update_data = branch_data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(branch, field, value)

    db.commit()
    db.refresh(branch)

    return branch


@router.delete(
    "/{branch_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_branch(
    restaurant_id: int,
    branch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_restaurant(restaurant_id, current_user, db)

    branch = (
        db.query(Branch)
        .filter(
            Branch.id == branch_id,
            Branch.restaurant_id == restaurant_id,
        )
        .first()
    )

    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found",
        )

    if branch_has_order_history(db, branch.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This branch has order history and cannot be deleted. "
                "Deactivate the branch instead to preserve historical orders."
            ),
        )

    try:
        db.delete(branch)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This branch is referenced by existing records and cannot "
                "be deleted. Deactivate the branch instead."
            ),
        )

    return None