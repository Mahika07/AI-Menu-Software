from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.dependencies import get_current_user
from app.database.connection import get_db

from app.models.analytics import AnalyticsEvent
from app.models.branch import Branch
from app.models.dish import Dish
from app.models.review import Review
from app.models.user import User

from app.schemas.analytics import (
    AnalyticsEventCreate,
    ALLOWED_EVENT_TYPES,
    AnalyticsDashboardResponse,
    AnalyticsSummary,
    AnalyticsTrendPoint,
    PopularDish,
    RatingDistribution,
    RecentReview,
)


router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)


# =========================================================
# CREATE ANALYTICS EVENT
# =========================================================

@router.post("/events")
@limiter.limit("60/minute")
def create_analytics_event(
    event: AnalyticsEventCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    if event.event_type not in ALLOWED_EVENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid analytics event type",
        )

    # ---------------------------------------------------------
    # Verify branch
    # ---------------------------------------------------------

    branch = (
        db.query(Branch)
        .filter(Branch.id == event.branch_id)
        .first()
    )

    if not branch:
        raise HTTPException(
            status_code=404,
            detail="Branch not found",
        )

    # ---------------------------------------------------------
    # Validate table belongs to branch
    # ---------------------------------------------------------

    if event.table_id is not None:
        from app.models.table import RestaurantTable

        table = (
            db.query(RestaurantTable)
            .filter(
                RestaurantTable.id == event.table_id,
                RestaurantTable.branch_id == event.branch_id,
            )
            .first()
        )

        if not table:
            raise HTTPException(
                status_code=400,
                detail="Invalid table for this branch",
            )

    # ---------------------------------------------------------
    # Validate dish belongs to branch
    # ---------------------------------------------------------

    if event.dish_id is not None:
        dish = (
            db.query(Dish)
            .filter(
                Dish.id == event.dish_id,
                Dish.branch_id == event.branch_id,
            )
            .first()
        )

        if not dish:
            raise HTTPException(
                status_code=400,
                detail="Invalid dish for this branch",
            )

    # ---------------------------------------------------------
    # Create event
    # ---------------------------------------------------------

    analytics_event = AnalyticsEvent(
        branch_id=event.branch_id,
        table_id=event.table_id,
        dish_id=event.dish_id,
        event_type=event.event_type,
        session_id=event.session_id,
        event_metadata=event.event_metadata,
    )

    db.add(analytics_event)
    db.commit()
    db.refresh(analytics_event)

    return analytics_event


# =========================================================
# BRANCH ANALYTICS DASHBOARD
# =========================================================

@router.get(
    "/branches/{branch_id}",
    response_model=AnalyticsDashboardResponse,
)
def get_branch_analytics(
    branch_id: int,
    days: int = Query(
        default=7,
        ge=7,
        le=90,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # =========================================================
    # VERIFY BRANCH OWNERSHIP
    # =========================================================

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

    # =========================================================
    # DATE RANGE
    # =========================================================

    today = datetime.now(
        timezone.utc
    ).date()

    start_date = today - timedelta(
        days=days - 1
    )

    start_datetime = datetime.combine(
        start_date,
        datetime.min.time(),
        tzinfo=timezone.utc,
    )

    # =========================================================
    # SUMMARY
    # =========================================================

    def count_events(event_type: str) -> int:
        return (
            db.query(func.count(AnalyticsEvent.id))
            .filter(
                AnalyticsEvent.branch_id == branch_id,
                AnalyticsEvent.event_type == event_type,
                AnalyticsEvent.created_at >= start_datetime,
            )
            .scalar()
            or 0
        )

    total_events = (
        db.query(func.count(AnalyticsEvent.id))
        .filter(
            AnalyticsEvent.branch_id == branch_id,
            AnalyticsEvent.created_at >= start_datetime,
        )
        .scalar()
        or 0
    )

    qr_scans = count_events("QR_SCAN")

    menu_views = count_events("MENU_VIEW")

    dish_views = count_events("DISH_VIEW")

    searches = count_events("SEARCH")

    ai_questions = count_events("AI_QUESTION")

    reviews_submitted = count_events(
        "REVIEW_SUBMITTED"
    )

    # =========================================================
    # UNIQUE VISITORS
    # =========================================================

    unique_visitors = (
        db.query(
            func.count(
                distinct(
                    AnalyticsEvent.session_id
                )
            )
        )
        .filter(
            AnalyticsEvent.branch_id == branch_id,
            AnalyticsEvent.session_id.isnot(None),
            AnalyticsEvent.created_at >= start_datetime,
        )
        .scalar()
        or 0
    )

    # =========================================================
    # AVERAGE RATING
    # =========================================================

    average_rating = (
        db.query(func.avg(Review.rating))
        .join(
            Dish,
            Review.dish_id == Dish.id,
        )
        .filter(
            Dish.branch_id == branch_id,
            Review.created_at >= start_datetime,
        )
        .scalar()
    )

    if average_rating is not None:
        average_rating = round(
            float(average_rating),
            1,
        )

    # =========================================================
    # RATING DISTRIBUTION
    # =========================================================

    rating_rows = (
        db.query(
            Review.rating,
            func.count(Review.id).label("count"),
        )
        .join(
            Dish,
            Review.dish_id == Dish.id,
        )
        .filter(
            Dish.branch_id == branch_id,
            Review.created_at >= start_datetime,
        )
        .group_by(
            Review.rating,
        )
        .all()
    )

    rating_lookup = {
        rating: count
        for rating, count in rating_rows
    }

    rating_distribution = [
        RatingDistribution(
            rating=rating,
            count=rating_lookup.get(
                rating,
                0,
            ),
        )
        for rating in range(5, 0, -1)
    ]

    # =========================================================
    # RECENT REVIEWS
    # =========================================================

    recent_review_rows = (
        db.query(
            Review.id,
            Review.dish_id,
            Dish.name,
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
            Review.created_at >= start_datetime,
        )
        .order_by(
            Review.created_at.desc(),
        )
        .limit(10)
        .all()
    )

    recent_reviews = [
        RecentReview(
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
        ) in recent_review_rows
    ]

    # =========================================================
    # POPULAR DISHES
    # =========================================================

    popular_dishes = (
        db.query(
            AnalyticsEvent.dish_id,
            Dish.name,
            func.count(
                AnalyticsEvent.id
            ).label("views"),
        )
        .join(
            Dish,
            Dish.id == AnalyticsEvent.dish_id,
        )
        .filter(
            AnalyticsEvent.branch_id == branch_id,
            AnalyticsEvent.event_type == "DISH_VIEW",
            AnalyticsEvent.dish_id.isnot(None),
            AnalyticsEvent.created_at >= start_datetime,
        )
        .group_by(
            AnalyticsEvent.dish_id,
            Dish.name,
        )
        .order_by(
            func.count(
                AnalyticsEvent.id
            ).desc()
        )
        .limit(10)
        .all()
    )

    popular_dish_response = [
        PopularDish(
            dish_id=dish_id,
            dish_name=dish_name,
            views=views,
        )
        for dish_id, dish_name, views
        in popular_dishes
    ]

    # =========================================================
    # TREND DATA
    # =========================================================

    trend_rows = (
        db.query(
            func.date(
                AnalyticsEvent.created_at
            ).label("event_date"),
            AnalyticsEvent.event_type,
            func.count(
                AnalyticsEvent.id
            ).label("count"),
        )
        .filter(
            AnalyticsEvent.branch_id == branch_id,
            AnalyticsEvent.created_at >= start_datetime,
        )
        .group_by(
            func.date(
                AnalyticsEvent.created_at
            ),
            AnalyticsEvent.event_type,
        )
        .all()
    )

    # =========================================================
    # ORGANIZE TREND DATA
    # =========================================================

    trend_lookup = {}

    event_mapping = {
        "MENU_VIEW": "menu_views",
        "QR_SCAN": "qr_scans",
        "DISH_VIEW": "dish_views",
        "SEARCH": "searches",
        "AI_QUESTION": "ai_questions",
        "REVIEW_SUBMITTED": "reviews_submitted",
    }

    for event_date, event_type, count in trend_rows:

        if hasattr(event_date, "date"):
            event_date = event_date.date()

        if event_date not in trend_lookup:
            trend_lookup[event_date] = {
                "menu_views": 0,
                "qr_scans": 0,
                "dish_views": 0,
                "searches": 0,
                "ai_questions": 0,
                "reviews_submitted": 0,
            }

        field = event_mapping.get(
            event_type
        )

        if field:
            trend_lookup[event_date][field] = count

    # =========================================================
    # CREATE TREND POINT FOR EVERY DAY
    # =========================================================

    trends = []

    for offset in range(days):

        current_date = (
            start_date
            + timedelta(days=offset)
        )

        values = trend_lookup.get(
            current_date,
            {
                "menu_views": 0,
                "qr_scans": 0,
                "dish_views": 0,
                "searches": 0,
                "ai_questions": 0,
                "reviews_submitted": 0,
            },
        )

        trends.append(
            AnalyticsTrendPoint(
                date=current_date,
                menu_views=values[
                    "menu_views"
                ],
                qr_scans=values[
                    "qr_scans"
                ],
                dish_views=values[
                    "dish_views"
                ],
                searches=values[
                    "searches"
                ],
                ai_questions=values[
                    "ai_questions"
                ],
                reviews_submitted=values[
                    "reviews_submitted"
                ],
            )
        )

    # =========================================================
    # SUMMARY RESPONSE
    # =========================================================

    summary = AnalyticsSummary(
        total_events=total_events,
        qr_scans=qr_scans,
        menu_views=menu_views,
        dish_views=dish_views,
        searches=searches,
        ai_questions=ai_questions,
        reviews_submitted=reviews_submitted,
        unique_visitors=unique_visitors,
        average_rating=average_rating,
    )

    # =========================================================
    # FINAL RESPONSE
    # =========================================================

    return AnalyticsDashboardResponse(
        branch_id=branch_id,
        summary=summary,
        popular_dishes=popular_dish_response,
        trends=trends,
        rating_distribution=rating_distribution,
        recent_reviews=recent_reviews,
    )