import json
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
            raw = value.strip()
            if not raw:
                return []
            try:
                data = json.loads(raw)
                if isinstance(data, list):
                    return [int(item) for item in data]
            except json.JSONDecodeError:
                pass
            for delimiter in (",", " "):
                if delimiter in raw:
                    parts = [item.strip() for item in raw.split(delimiter) if item.strip()]
                    return [int(item) for item in parts]
            return [int(raw)]
        return value


@lru_cache(maxsize=1)
def get_settings() -> BotSettings:
    return BotSettings()
