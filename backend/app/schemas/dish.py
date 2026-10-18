from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


DietaryType = Literal[
    "Vegetarian",
    "Vegan",
    "Non-Vegetarian",
    "Egg",
]

SpiceLevel = Literal[
    "Mild",
    "Medium",
    "Spicy",
    "Very Spicy",
]


class DishCreate(BaseModel):
    category_id: int = Field(
        gt=0
    )

    name: str = Field(
        min_length=2,
        max_length=150,
    )

    description: str | None = Field(
        default=None,
        max_length=2000,
    )

    price: Decimal = Field(
        gt=0,
        max_digits=10,
        decimal_places=2,
    )

    image_url: str | None = Field(
        default=None,
        max_length=500,
    )

    ingredients: str | None = Field(
        default=None,
        max_length=2000,
    )

    spice_level: SpiceLevel | None = None

    dietary_type: DietaryType | None = None

    allergens: str | None = Field(
        default=None,
        max_length=1000,
    )

    serving_size: str | None = Field(
        default=None,
        max_length=100,
    )


class DishUpdate(BaseModel):
    category_id: int | None = Field(
        default=None,
        gt=0,
    )

    name: str | None = Field(
        default=None,
        min_length=2,
        max_length=150,
    )

    description: str | None = Field(
        default=None,
        max_length=2000,
    )

    price: Decimal | None = Field(
        default=None,
        gt=0,
        max_digits=10,
        decimal_places=2,
    )

    image_url: str | None = Field(
        default=None,
        max_length=500,
    )

    ingredients: str | None = Field(
        default=None,
        max_length=2000,
    )

    spice_level: SpiceLevel | None = None

    dietary_type: DietaryType | None = None

    allergens: str | None = Field(
        default=None,
        max_length=1000,
    )

    serving_size: str | None = Field(
        default=None,
        max_length=100,
    )

    is_available: bool | None = None


class DishResponse(BaseModel):
    id: int
    branch_id: int
    category_id: int
    name: str
    description: str | None
    price: Decimal
    image_url: str | None
    ingredients: str | None
    spice_level: str | None
    dietary_type: str | None
    allergens: str | None
    serving_size: str | None
    is_available: bool

    model_config = {
        "from_attributes": True
    }