
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class BillCreate(BaseModel):
    discount_amount: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
    )
    tax_rate: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        le=100,
    )


class BillOrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dish_id: int | None = None
    dish_name: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    special_instructions: str | None = None
    status: str = "pending"
    status_updated_at: datetime | None = None


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

    items: list[BillOrderItemResponse] = Field(
        default_factory=list
    )


class BillResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bill_number: str

    # Primary order retained for backward compatibility.
    order_id: int

    # New session-level billing reference.
    dining_session_id: int | None = None

    branch_id: int

    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal

    cancelled_amount: Decimal = Decimal("0.00")
    cancelled_by: str | None = None
    cancelled_at: datetime | None = None

    payment_status: str
    payment_method: str | None = None
    paid_at: datetime | None = None
    created_at: datetime

    # Legacy single-order response.
    order: BillOrderResponse | None = None

    # New consolidated response.
    orders: list[BillOrderResponse] = Field(
        default_factory=list
    )

    branch_name: str
    restaurant_name: str
