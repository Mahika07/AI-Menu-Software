
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


OrderStatus = Literal[
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "completed",
    "cancelled",
]

OrderItemStatus = Literal[
    "pending",
    "preparing",
    "ready",
    "served",
    "cancelled",
]


class OrderItemCreate(BaseModel):
    dish_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=20)
    special_instructions: str | None = Field(
        default=None,
        max_length=500,
    )

    @field_validator("special_instructions")
    @classmethod
    def clean_instructions(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class OrderCreate(BaseModel):
    customer_id: int | None = Field(default=None, gt=0)
    customer_name: str | None = Field(default=None, max_length=100)
    customer_number: str | None = Field(default=None, max_length=20)
    customer_note: str | None = Field(default=None, max_length=1000)

    items: list[OrderItemCreate] = Field(min_length=1, max_length=30)

    @field_validator("customer_name", "customer_number", "customer_note")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("items")
    @classmethod
    def unique_dishes(
        cls,
        items: list[OrderItemCreate],
    ) -> list[OrderItemCreate]:
        dish_ids = [item.dish_id for item in items]

        if len(dish_ids) != len(set(dish_ids)):
            raise ValueError(
                "Each dish must appear once in an order. "
                "Combine duplicate dishes by increasing quantity."
            )

        return items


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderItemStatusUpdate(BaseModel):
    status: OrderItemStatus


class OrderItemResponse(BaseModel):
    id: int
    dish_id: int | None
    dish_name: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    special_instructions: str | None
    status: OrderItemStatus = "pending"
    status_updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    order_number: str
    branch_id: int
    table_number: str
    status: OrderStatus
    customer_id: int | None = None
    customer_name: str | None
    customer_number: str | None = None
    customer_note: str | None
    subtotal: Decimal
    total_amount: Decimal
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse]

    model_config = ConfigDict(from_attributes=True)


class OwnerOrderResponse(OrderResponse):
    id: int


class PublicOrderStatusResponse(BaseModel):
    order_number: str
    table_number: str
    status: OrderStatus
    subtotal: Decimal
    total_amount: Decimal
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse]

    model_config = ConfigDict(from_attributes=True)
