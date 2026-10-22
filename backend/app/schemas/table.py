
from pydantic import BaseModel, Field


class TableCreate(BaseModel):
    table_number: str = Field(
        min_length=1,
        max_length=50,
    )


class TableUpdate(BaseModel):
    table_number: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
    )

    is_active: bool | None = None
    is_unavailable: bool | None = None
    is_occupied: bool | None = None


class TableResponse(BaseModel):
    id: int
    branch_id: int
    table_number: str
    qr_token: str
    is_active: bool
    is_unavailable: bool = False
    is_occupied: bool = False

    model_config = {"from_attributes": True}
