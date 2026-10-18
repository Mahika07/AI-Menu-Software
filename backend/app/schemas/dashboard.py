from pydantic import BaseModel


class DashboardStats(BaseModel):
    restaurants: int
    branches: int
    categories: int
    dishes: int
    available_dishes: int
    tables: int