from decimal import Decimal

from pydantic import BaseModel


class PublicDish(BaseModel):
    id: int
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

    model_config = {"from_attributes": True}


class PublicCategory(BaseModel):
    id: int
    name: str
    description: str | None
    display_order: int
    dishes: list[PublicDish]

    model_config = {"from_attributes": True}


class PublicMenuResponse(BaseModel):
    restaurant_name: str
    logo_url: str | None = None
    branch_name: str

    # Analytics identifiers
    branch_id: int
    table_id: int

    categories: list[PublicCategory]