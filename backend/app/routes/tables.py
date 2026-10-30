
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_
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


def table_has_outstanding_order(
    db: Session,
    table: RestaurantTable,
) -> bool:
    """Return True when an order or unpaid bill still occupies the table."""

    outstanding_order = (
        db.query(Order.id)
        .outerjoin(
            Bill,
            and_(
                Bill.order_id == Order.id,
                Bill.branch_id == Order.branch_id,
            ),
        )
        .filter(
            Order.branch_id == table.branch_id,
            Order.table_id == table.id,
            or_(
                and_(
                    Bill.id.is_not(None),
                    or_(
                        Bill.payment_status.is_(None),
                        Bill.payment_status != "paid",
                    ),
                ),
                and_(
                    Bill.id.is_(None),
                    Order.status.notin_(["completed", "cancelled"]),
                ),
            ),
        )
        .first()
    )

    return outstanding_order is not None


def table_payload(
    db: Session,
    table: RestaurantTable,
) -> dict:
    occupied = table_has_outstanding_order(db, table)

    return {
        "id": table.id,
        "branch_id": table.branch_id,
        "table_number": table.table_number,
        "qr_token": table.qr_token,
        "is_active": table.is_active,
        "is_unavailable": table.is_unavailable,
        "is_occupied": bool(table.is_occupied or occupied),
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
        is_unavailable=False,
        is_occupied=False,
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

    if "table_number" in updates and updates["table_number"] is not None:
        table_number = updates["table_number"].strip()

        if not table_number:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Table number cannot be empty.",
            )

        updates["table_number"] = table_number

        existing_table = (
            db.query(RestaurantTable)
            .filter(
                RestaurantTable.branch_id == branch.id,
                RestaurantTable.table_number == table_number,
                RestaurantTable.id != table.id,
            )
            .first()
        )

        if existing_table:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Table number already exists in this branch.",
            )

    outstanding = table_has_outstanding_order(db, table)

# A table with an outstanding order or unpaid bill
# cannot be marked available.
    if updates.get("is_occupied") is False and outstanding:
        raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=(
            "This table cannot be marked available while it has "
            "an outstanding order or unpaid bill."
        ),
    )

# An unavailable table must first be made available
# before it can be occupied.
    if updates.get("is_occupied") is True and table.is_unavailable:
        raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Make this table available before marking it occupied.",
    )

# A table cannot become unavailable while occupied
# or while it has outstanding orders.
    if updates.get("is_unavailable") is True:
        if table.is_occupied or outstanding:
            raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This table cannot be marked unavailable while occupied "
                "or while it has an outstanding order or unpaid bill."
            ),
        )

# Do not allow deactivation while occupied.
    if updates.get("is_active") is False:
        if table.is_occupied or outstanding:
            raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This table cannot be deactivated while occupied "
                "or while it has an outstanding order or unpaid bill."
            ),
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

    if table_has_outstanding_order(db, table) or table.is_occupied:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This table cannot be deleted while it is occupied or has "
                "an outstanding order or unpaid bill."
            ),
        )

    db.delete(table)
    db.commit()

    return None
