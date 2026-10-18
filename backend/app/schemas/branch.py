from pydantic import BaseModel, Field


class BranchCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    address: str = Field(min_length=5, max_length=500)
    phone: str | None = Field(default=None, max_length=20)


class BranchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    address: str | None = Field(default=None, min_length=5, max_length=500)
    phone: str | None = Field(default=None, max_length=20)
    is_active: bool | None = None


class BranchResponse(BaseModel):
    id: int
    restaurant_id: int
    name: str
    address: str
    phone: str | None
    is_active: bool

    model_config = {"from_attributes": True}