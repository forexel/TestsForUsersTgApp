from pydantic import BaseModel


class StatsResponse(BaseModel):
    tests_created: int
    tests_completed: int
    tests_opened: int
