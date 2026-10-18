from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.user import User
from app.models.restaurant import Restaurant
from app.models.branch import Branch
from app.models.table import RestaurantTable

from app.schemas.table import (
    TableCreate,
    TableUpdate,
    TableResponse,
)

from app.core.dependencies import get_current_user


router = APIRouter(
    prefix="/branches/{branch_id}/tables",
    tags=["Tables"]
)


def get_owned_branch(
    branch_id: int,
    current_user: User,
    db: Session
):
    branch = (
        db.query(Branch)
        .join(Restaurant, Branch.restaurant_id == Restaurant.id)
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
    response_model=TableResponse,
    status_code=status.HTTP_201_CREATED
)
def create_table(
    branch_id: int,
    table_data: TableCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    branch = get_owned_branch(
        branch_id,
        current_user,
        db
    )

    existing_table = (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.branch_id == branch.id,
            RestaurantTable.table_number == table_data.table_number
        )
        .first()
    )

    if existing_table:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Table number already exists in this branch"
        )

    new_table = RestaurantTable(
        branch_id=branch.id,
        table_number=table_data.table_number
    )

    db.add(new_table)
    db.commit()
    db.refresh(new_table)

    return new_table


@router.get(
    "",
    response_model=list[TableResponse]
)
def get_tables(
    branch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    branch = get_owned_branch(
        branch_id,
        current_user,
        db
    )

    return (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.branch_id == branch.id
        )
        .order_by(RestaurantTable.id.asc())
        .all()
    )


@router.get(
    "/{table_id}",
    response_model=TableResponse
)
def get_table(
    branch_id: int,
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    branch = get_owned_branch(
        branch_id,
        current_user,
        db
    )

    table = (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch.id
        )
        .first()
    )

    if not table:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table not found"
        )

    return table


@router.put(
    "/{table_id}",
    response_model=TableResponse
)
def update_table(
    branch_id: int,
    table_id: int,
    table_data: TableUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    branch = get_owned_branch(
        branch_id,
        current_user,
        db
    )

    table = (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch.id
        )
        .first()
    )

    if not table:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table not found"
        )

    updates = table_data.model_dump(exclude_unset=True)

    if "table_number" in updates:
        existing_table = (
            db.query(RestaurantTable)
            .filter(
                RestaurantTable.branch_id == branch.id,
                RestaurantTable.table_number == updates["table_number"],
                RestaurantTable.id != table.id
            )
            .first()
        )

        if existing_table:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Table number already exists in this branch"
            )

    for field, value in updates.items():
        setattr(table, field, value)

    db.commit()
    db.refresh(table)

    return table


@router.delete(
    "/{table_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_table(
    branch_id: int,
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    branch = get_owned_branch(
        branch_id,
        current_user,
        db
    )

    table = (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch.id
        )
        .first()
    )

    if not table:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table not found"
        )

    db.delete(table)
    db.commit()

    return None