from pydantic import BaseModel, Field


class RestaurantCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=255)
    logo_url: str | None = Field(default=None, max_length=500)


class RestaurantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=255)
    logo_url: str | None = Field(default=None, max_length=500)


class RestaurantResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    description: str | None
    location: str | None
    logo_url: str | None

    model_config = {
        "from_attributes": True
    }