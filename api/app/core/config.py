from functools import lru_cache
from typing import List

import json
from pydantic import BaseSettings, validator


class Settings(BaseSettings):
    app_name: str = "TestsForUsers API"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://postgres:postgres@db:5432/tests_for_users"
    s3_endpoint: str | None = None
    s3_bucket: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_region: str | None = None
    s3_use_path_style: bool = True
    s3_public_base_url: str | None = None
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
            s = value.strip()
            if not s:
                return []
            # accept JSON array format, e.g. "[123,456]"
            if s.startswith("[") and s.endswith("]"):
                try:
                    arr = json.loads(s)
                    return [int(item) for item in arr]
                except Exception:
                    pass
            # accept comma-separated string, e.g. "123,456"
            return [int(item.strip()) for item in s.split(",") if item.strip()]
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
