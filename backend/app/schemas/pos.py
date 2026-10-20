
from pydantic import Field

from app.schemas.order import OrderCreate


class POSOrderCreate(OrderCreate):
    """Authenticated staff-created order; table_id is optional for takeaway."""

    table_id: int | None = Field(default=None, gt=0)
