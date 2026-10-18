from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.core.rate_limit import limiter
from app.models.user import User
from app.models.branch import Branch
from app.core.dependencies import get_current_user
from app.database.connection import get_db
from app.models.dish import Dish
from app.models.review import Review
from app.schemas.review import (
    ReviewCreate,
    ReviewResponse,
    OwnerReviewResponse
)

public_router = APIRouter(
    prefix="/public/reviews",
    tags=["Reviews"],
)

owner_router = APIRouter(
    prefix="/reviews",
    tags=["Owner Reviews"],
)

@public_router.post(
    "",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
def create_review(
    review_data: ReviewCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    # Verify that the dish exists.
    dish = db.scalar(
        select(Dish).where(
            Dish.id == review_data.dish_id
        )
    )

    if not dish:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dish not found.",
        )

    # Prevent reviews for unavailable dishes.
    if not dish.is_available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reviews cannot be submitted for unavailable dishes.",
        )

    review = Review(
        dish_id=review_data.dish_id,
        rating=review_data.rating,
        customer_name=review_data.customer_name,
        comment=review_data.comment,
    )

    db.add(review)
    db.commit()
    db.refresh(review)

    return review


@public_router.get(
    "/dish/{dish_id}",
    response_model=list[ReviewResponse],
)
@limiter.limit("30/minute")
def get_dish_reviews(
    dish_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    dish = db.scalar(
        select(Dish).where(Dish.id == dish_id)
    )

    if not dish:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dish not found.",
        )

    reviews = db.scalars(
        select(Review)
        .where(Review.dish_id == dish_id)
        .order_by(Review.created_at.desc())
    ).all()

    return reviews

@owner_router.get(
    "/branches/{branch_id}",
    response_model=list[OwnerReviewResponse],
)
def get_owner_reviews(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    branch = (
        db.query(Branch)
        .filter(
            Branch.id == branch_id,
            Branch.restaurant.has(
                owner_id=current_user.id
            ),
        )
        .first()
    )

    if not branch:
        raise HTTPException(
            status_code=404,
            detail="Branch not found",
        )

    reviews = (
        db.query(
            Review.id,
            Review.dish_id,
            Dish.name.label("dish_name"),
            Review.rating,
            Review.customer_name,
            Review.comment,
            Review.created_at,
        )
        .join(
            Dish,
            Review.dish_id == Dish.id,
        )
        .filter(
            Dish.branch_id == branch_id,
        )
        .order_by(
            Review.created_at.desc()
        )
        .all()
    )

    return [
        OwnerReviewResponse(
            id=review_id,
            dish_id=dish_id,
            dish_name=dish_name,
            rating=rating,
            customer_name=customer_name,
            comment=comment,
            created_at=created_at,
        )
        for (
            review_id,
            dish_id,
            dish_name,
            rating,
            customer_name,
            comment,
            created_at,
        ) in reviews
    ]
