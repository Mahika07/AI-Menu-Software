from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DiningSessionResponse(BaseModel):
    token: str
    table_id: int
    created_at: datetime
    expires_at: datetime

    model_config = ConfigDict(from_attributes=True)