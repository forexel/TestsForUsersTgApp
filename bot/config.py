from functools import lru_cache
from typing import List

from pydantic import BaseSettings, HttpUrl, validator


class BotSettings(BaseSettings):
    bot_token: str = ""
    api_base_url: HttpUrl | str = "http://api:8000/api/v1"
    webapp_url: HttpUrl | str = "https://example.com"
    admin_ids: List[int] = []

    class Config:
        env_file = ".env"
        env_prefix = "BOT_"

    @validator("admin_ids", pre=True)
    def parse_admin_ids(cls, value):
        if isinstance(value, str):
            if not value.strip():
                return []
            return [int(item.strip()) for item in value.split(",") if item.strip()]
        return value


@lru_cache(maxsize=1)
def get_settings() -> BotSettings:
    return BotSettings()
