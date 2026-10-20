
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import distinct

from app.database.connection import get_db
from app.models.user import User
from app.models.restaurant import Restaurant
from app.models.branch import Branch
from app.models.table import RestaurantTable
from app.models.order import Order

from app.schemas.table import (
    TableCreate,
    TableUpdate,
    TableResponse,
)

from app.core.dependencies import get_current_user


router = APIRouter(
    prefix="/branches/{branch_id}/tables",
    tags=["Tables"],
)

# An order occupies a table until it is explicitly completed or cancelled.
CLOSED_ORDER_STATUSES = {"completed", "cancelled"}


def get_owned_branch(
    branch_id: int,
    current_user: User,
    db: Session,
):
    branch = (
        db.query(Branch)
        .join(Restaurant, Branch.restaurant_id == Restaurant.id)
        .filter(
            Branch.id == branch_id,
            Restaurant.owner_id == current_user.id,
        )
        .first()
    )

    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found.",
        )

    return branch


def get_occupied_table_ids(
    db: Session,
    branch_id: int,
) -> set[int]:
    rows = (
        db.query(distinct(Order.table_id))
        .filter(
            Order.branch_id == branch_id,
            Order.table_id.isnot(None),
            Order.status.notin_(CLOSED_ORDER_STATUSES),
        )
        .all()
    )

    return {row[0] for row in rows}


def table_payload(
    table: RestaurantTable,
    occupied_table_ids: set[int],
) -> dict:
    return {
        "id": table.id,
        "branch_id": table.branch_id,
        "table_number": table.table_number,
        "qr_token": table.qr_token,
        "is_active": table.is_active,
        "is_occupied": table.id in occupied_table_ids,
    }


def ensure_table_has_no_active_orders(
    db: Session,
    table: RestaurantTable,
) -> None:
    active_order = (
        db.query(Order.id)
        .filter(
            Order.branch_id == table.branch_id,
            Order.table_id == table.id,
            Order.status.notin_(CLOSED_ORDER_STATUSES),
        )
        .first()
    )

    if active_order is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Table {table.table_number} has an active order. "
                "Complete or cancel the order before deactivating "
                "or deleting this table."
            ),
        )


@router.post(
    "",
    response_model=TableResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_table(
    branch_id: int,
    table_data: TableCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(branch_id, current_user, db)

    table_number = table_data.table_number.strip()

    if not table_number:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Table number cannot be empty.",
        )

    existing_table = (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.branch_id == branch.id,
            RestaurantTable.table_number == table_number,
        )
        .first()
    )

    if existing_table:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Table number already exists in this branch.",
        )

    new_table = RestaurantTable(
        branch_id=branch.id,
        table_number=table_number,
        is_active=True,
    )

    try:
        db.add(new_table)
        db.commit()
        db.refresh(new_table)
    except Exception:
        db.rollback()
        raise

    return table_payload(new_table, set())


@router.get(
    "",
    response_model=list[TableResponse],
)
def get_tables(
    branch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(branch_id, current_user, db)

    tables = (
        db.query(RestaurantTable)
        .filter(RestaurantTable.branch_id == branch.id)
        .order_by(RestaurantTable.id.asc())
        .all()
    )

    occupied_ids = get_occupied_table_ids(db, branch.id)

    return [
        table_payload(table, occupied_ids)
        for table in tables
    ]


@router.get(
    "/{table_id}",
    response_model=TableResponse,
)
def get_table(
    branch_id: int,
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(branch_id, current_user, db)

    table = (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch.id,
        )
        .first()
    )

    if table is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table not found.",
        )

    occupied_ids = get_occupied_table_ids(db, branch.id)

    return table_payload(table, occupied_ids)


@router.put(
    "/{table_id}",
    response_model=TableResponse,
)
def update_table(
    branch_id: int,
    table_id: int,
    table_data: TableUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(branch_id, current_user, db)

    table = (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch.id,
        )
        .with_for_update()
        .first()
    )

    if table is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table not found.",
        )

    updates = table_data.model_dump(exclude_unset=True)

    if "table_number" in updates:
        new_number = updates["table_number"]

        if new_number is None or not new_number.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Table number cannot be empty.",
            )

        new_number = new_number.strip()

        existing_table = (
            db.query(RestaurantTable)
            .filter(
                RestaurantTable.branch_id == branch.id,
                RestaurantTable.table_number == new_number,
                RestaurantTable.id != table.id,
            )
            .first()
        )

        if existing_table:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Table number already exists in this branch.",
            )

        updates["table_number"] = new_number

    if updates.get("is_active") is False and table.is_active:
        ensure_table_has_no_active_orders(db, table)

    for field, value in updates.items():
        setattr(table, field, value)

    try:
        db.commit()
        db.refresh(table)
    except Exception:
        db.rollback()
        raise

    occupied_ids = get_occupied_table_ids(db, branch.id)

    return table_payload(table, occupied_ids)


@router.delete(
    "/{table_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_table(
    branch_id: int,
    table_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(branch_id, current_user, db)

    table = (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch.id,
        )
        .with_for_update()
        .first()
    )

    if table is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table not found.",
        )

    ensure_table_has_no_active_orders(db, table)

    try:
        db.delete(table)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return None
