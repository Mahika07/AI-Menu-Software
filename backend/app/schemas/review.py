from datetime import datetime

from pydantic import BaseModel, Field


class ReviewCreate(BaseModel):
    dish_id: int = Field(gt=0)
    rating: int = Field(ge=1, le=5)
    customer_name: str | None = Field(
        default=None,
        max_length=100,
    )
    comment: str | None = Field(
        default=None,
        max_length=1000,
    )


class ReviewResponse(BaseModel):
    id: int
    dish_id: int
    rating: int
    customer_name: str | None
    comment: str | None
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }

class OwnerReviewResponse(BaseModel):
    id: int
    dish_id: int
    dish_name: str
    rating: int
    customer_name: str | None
    comment: str | None
    created_at: datetime

    model_config = {
        "from_attributes": True
    }
