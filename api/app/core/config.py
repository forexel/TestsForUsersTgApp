from functools import lru_cache
from typing import List

from pydantic import BaseSettings, validator


class Settings(BaseSettings):
    app_name: str = "TestsForUsers API"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://postgres:postgres@db:5432/tests_for_users"
    s3_endpoint: str | None = None
    s3_bucket: str | None = None
    admin_ids: List[int] = []
    bot_token: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = False

    @validator("database_url")
    def validate_db_url(cls, value: str) -> str:
        if not value:
            raise ValueError("DATABASE_URL is required")
        return value

    @validator("bot_token")
    def validate_bot_token(cls, value: str) -> str:
        return value or ""

    @validator("admin_ids", pre=True)
    def parse_admin_ids(cls, value):
        if isinstance(value, str):
            if not value.strip():
                return []
            return [int(item.strip()) for item in value.split(",") if item.strip()]
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
