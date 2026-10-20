
import re

from pydantic import Field, field_validator

from app.schemas.order import OrderCreate


class POSOrderCreate(OrderCreate):
    """Authenticated staff-created order; table_id is optional for takeaway."""

    table_id: int | None = Field(default=None, gt=0)

    customer_number: str = Field(
        min_length=10,
        max_length=10,
        description="Required 10-digit Indian mobile number",
    )

    @field_validator("customer_number", mode="before")
    @classmethod
    def validate_customer_number(cls, value):
        if not isinstance(value, str):
            raise ValueError("Customer mobile number is required.")

        value = re.sub(r"[\s-]", "", value)

        if not re.fullmatch(r"[6-9]\d{9}", value):
            raise ValueError(
                "Enter a valid 10-digit Indian mobile number."
            )

        return value
