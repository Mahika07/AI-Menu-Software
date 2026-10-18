
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database.connection import get_db
from app.models.branch import Branch
from app.models.dining_session import DiningSession
from app.models.restaurant import Restaurant
from app.models.table import RestaurantTable
from app.models.user import User
router = APIRouter(
    prefix="/branches/{branch_id}/dining-sessions",
    tags=["Dining Sessions"],
)


def get_owned_branch(
    branch_id: int,
    current_user: User,
    db: Session,
) -> Branch:
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
        raise HTTPException(status_code=404, detail="Branch not found.")

    return branch


def serialize_session(session: DiningSession) -> dict:
    return {
        "id": session.id,
        "table_id": session.table_id,
        "created_at": session.created_at,
        "expires_at": session.expires_at,
        "closed_at": session.closed_at,
        # Session remains active until a restaurant staff member closes it.
        "is_active": session.closed_at is None,
    }

@router.get("")
def list_dining_sessions(
    branch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(branch_id, current_user, db)

    sessions = (
        db.query(DiningSession)
        .join(RestaurantTable, DiningSession.table_id == RestaurantTable.id)
        .filter(RestaurantTable.branch_id == branch.id)
        .order_by(DiningSession.created_at.desc())
        .limit(200)
        .all()
    )

    return [serialize_session(session) for session in sessions]


@router.patch("/{session_id}/close")
def close_dining_session(
    branch_id: int,
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    branch = get_owned_branch(branch_id, current_user, db)

    session = (
        db.query(DiningSession)
        .join(RestaurantTable, DiningSession.table_id == RestaurantTable.id)
        .filter(
            DiningSession.id == session_id,
            RestaurantTable.branch_id == branch.id,
        )
        .first()
    )

    if session is None:
        raise HTTPException(status_code=404, detail="Dining session not found.")

    if session.closed_at is None:
        session.closed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(session)

    return serialize_session(session)


@router.post("/tables/{table_id}/reset")
def reset_table_session(
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
            RestaurantTable.is_active.is_(True),
        )
        .first()
    )

    if table is None:
        raise HTTPException(status_code=404, detail="Active table not found.")

    now = datetime.now(timezone.utc)

    try:
        active_sessions = (
            db.query(DiningSession)
            .filter(
                DiningSession.table_id == table.id,
                DiningSession.closed_at.is_(None),
            )
            .all()
        )

        for session in active_sessions:
            session.closed_at = now

        db.commit()

        return {
            "table_id": table.id,
            "closed_count": len(active_sessions),
            "message": "Active sessions closed. A new session will be created when the next diner scans the QR code.",
        }

    except Exception:
        db.rollback()
        raise

