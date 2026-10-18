# backend/app/schemas/bill.py

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class BillCreate(BaseModel):
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    tax_rate: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)


class BillOrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dish_id: int | None = None
    dish_name: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    special_instructions: str | None = None


class BillOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_number: str
    branch_id: int
    table_number: str
    status: str
    customer_name: str | None = None
    customer_note: str | None = None
    subtotal: Decimal
    total_amount: Decimal
    created_at: datetime
    items: list[BillOrderItemResponse] = []


class BillResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bill_number: str
    order_id: int
    branch_id: int
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    payment_status: str
    payment_method: str | None = None
    paid_at: datetime | None = None
    created_at: datetime
    order: BillOrderResponse
    branch_name: str
    restaurant_name: str