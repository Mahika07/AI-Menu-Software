
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.restaurant import Restaurant
from app.models.branch import Branch
from app.models.table import RestaurantTable
from app.models.order import Order
from app.models.bill import Bill
from app.schemas.table import TableCreate, TableUpdate, TableResponse


router = APIRouter(
    prefix="/branches/{branch_id}/tables",
    tags=["Tables"],
)


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


def table_payload(db: Session, table: RestaurantTable) -> dict:
    """Build a table response with occupancy calculated from its orders."""

    outstanding_order = (
        db.query(Order.id)
        .outerjoin(Bill, Bill.order_id == Order.id)
        .filter(
            Order.branch_id == table.branch_id,
            Order.table_id == table.id,
            or_(
                Bill.id.is_(None),
                Bill.payment_status != "paid",
            ),
        )
        .first()
    )

    return {
        "id": table.id,
        "branch_id": table.branch_id,
        "table_number": table.table_number,
        "qr_token": table.qr_token,
        "is_active": table.is_active,
        "is_occupied": outstanding_order is not None,
    }


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

    existing_table = (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.branch_id == branch.id,
            RestaurantTable.table_number == table_data.table_number,
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
        table_number=table_data.table_number,
    )

    db.add(new_table)
    db.commit()
    db.refresh(new_table)

    return table_payload(db, new_table)


@router.get("", response_model=list[TableResponse])
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

    return [table_payload(db, table) for table in tables]


@router.get("/{table_id}", response_model=TableResponse)
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

    return table_payload(db, table)


@router.put("/{table_id}", response_model=TableResponse)
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
        .first()
    )

    if table is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table not found.",
        )

    updates = table_data.model_dump(exclude_unset=True)

    if "table_number" in updates:
        existing_table = (
            db.query(RestaurantTable)
            .filter(
                RestaurantTable.branch_id == branch.id,
                RestaurantTable.table_number == updates["table_number"],
                RestaurantTable.id != table.id,
            )
            .first()
        )

        if existing_table:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Table number already exists in this branch.",
            )

    for field, value in updates.items():
        setattr(table, field, value)

    db.commit()
    db.refresh(table)

    return table_payload(db, table)


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
        .first()
    )

    if table is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table not found.",
        )

    # Never delete a table while an order is still awaiting payment.
    if table_payload(db, table)["is_occupied"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This table cannot be deleted while an order is awaiting payment.",
        )

    db.delete(table)
    db.commit()

    return None
