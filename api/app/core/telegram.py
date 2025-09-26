from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl

from fastapi import HTTPException, status

from api.app.core.config import get_settings


@dataclass
class TelegramUser:
    id: int
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    language_code: str | None = None


@dataclass
class TelegramInitData:
    query_id: str | None
    user: TelegramUser
    auth_date: datetime
    raw: str


def parse_init_data(init_data: str) -> TelegramInitData:
    if not init_data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing init data")

    data = dict(parse_qsl(init_data, keep_blank_values=True))
    hash_value = data.pop("hash", None)
    if not hash_value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing hash")

    settings = get_settings()
    if not settings.bot_token:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Bot token not configured")

    secret_key = hashlib.sha256(settings.bot_token.encode()).digest()
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed_hash, hash_value):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid init data signature")

    auth_date_raw = data.get("auth_date")
    if not auth_date_raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing auth_date")

    auth_dt = datetime.fromtimestamp(int(auth_date_raw), tz=timezone.utc)
    if datetime.now(timezone.utc) - auth_dt > timedelta(hours=24):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Init data expired")

    user_raw = data.get("user")
    if not user_raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing user info")

    try:
        user_data = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed user data") from exc

    user = TelegramUser(
        id=int(user_data["id"]),
        first_name=user_data.get("first_name"),
        last_name=user_data.get("last_name"),
        username=user_data.get("username"),
        language_code=user_data.get("language_code"),
    )

    return TelegramInitData(query_id=data.get("query_id"), user=user, auth_date=auth_dt, raw=init_data)
