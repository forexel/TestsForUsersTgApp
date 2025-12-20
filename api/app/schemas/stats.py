from pydantic import BaseModel


class StatsResponse(BaseModel):
    tests_created: int
    tests_completed: int
    tests_opened: int
    daily_created_users: int
    daily_opened_users: int
    daily_completed_users: int
    monthly_created_users: int
    monthly_opened_users: int
    monthly_completed_users: int
