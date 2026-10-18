from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


PaymentMethod = Literal["cash", "upi", "card", "other"]


class BillPaymentCreate(BaseModel):
    payment_method: PaymentMethod


class BillPaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bill_number: str
    total_amount: float
    payment_status: str
    payment_method: str | None = None
    paid_at: datetime | None = None