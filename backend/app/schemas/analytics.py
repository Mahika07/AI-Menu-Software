from datetime import datetime, date

from pydantic import BaseModel, Field


# =========================================================
# ALLOWED ANALYTICS EVENTS
# =========================================================

ALLOWED_EVENT_TYPES = {
    "QR_SCAN",
    "MENU_VIEW",
    "DISH_VIEW",
    "SEARCH",
    "AI_QUESTION",
    "REVIEW_SUBMITTED",
}


# =========================================================
# CREATE ANALYTICS EVENT
# =========================================================

class AnalyticsEventCreate(BaseModel):
    branch_id: int = Field(gt=0)

    table_id: int | None = Field(
        default=None,
        gt=0,
    )

    dish_id: int | None = Field(
        default=None,
        gt=0,
    )

    event_type: str = Field(
        min_length=1,
        max_length=50,
    )

    session_id: str | None = Field(
        default=None,
        max_length=100,
    )

    event_metadata: str | None = Field(
        default=None,
        max_length=5000,
    )


# =========================================================
# ANALYTICS EVENT RESPONSE
# =========================================================

class AnalyticsEventResponse(BaseModel):
    id: int
    branch_id: int
    table_id: int | None
    dish_id: int | None
    event_type: str
    session_id: str | None
    event_metadata: str | None
    created_at: datetime

    model_config = {
        "from_attributes": True
    }


# =========================================================
# ANALYTICS SUMMARY
# =========================================================

class AnalyticsSummary(BaseModel):
    total_events: int

    qr_scans: int
    menu_views: int
    dish_views: int
    searches: int
    ai_questions: int
    reviews_submitted: int

    unique_visitors: int

    average_rating: float | None


# =========================================================
# POPULAR DISH
# =========================================================

class PopularDish(BaseModel):
    dish_id: int
    dish_name: str
    views: int


# =========================================================
# DAILY ANALYTICS TREND
# =========================================================

class AnalyticsTrendPoint(BaseModel):
    date: date

    menu_views: int
    qr_scans: int
    dish_views: int
    searches: int
    ai_questions: int
    reviews_submitted: int


# =========================================================
# RATING DISTRIBUTION
# =========================================================

class RatingDistribution(BaseModel):
    rating: int
    count: int


# =========================================================
# RECENT REVIEW
# =========================================================

class RecentReview(BaseModel):
    id: int
    dish_id: int
    dish_name: str

    rating: int

    customer_name: str | None
    comment: str | None

    created_at: datetime


# =========================================================
# COMPLETE ANALYTICS DASHBOARD
# =========================================================

class AnalyticsDashboardResponse(BaseModel):
    branch_id: int

    summary: AnalyticsSummary

    popular_dishes: list[PopularDish]

    trends: list[AnalyticsTrendPoint]

    rating_distribution: list[RatingDistribution]

    recent_reviews: list[RecentReview]