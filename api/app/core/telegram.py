from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl
import logging

from fastapi import HTTPException, status

from api.app.core.config import get_settings
logger = logging.getLogger("api.tg_auth")
logger.setLevel(logging.DEBUG)


@dataclass
class TelegramUser:
    id: int
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    language_code: str | None = None


@dataclass
class TelegramChat:
    id: int | None = None
    type: str | None = None
    title: str | None = None
    username: str | None = None


@dataclass
class TelegramInitData:
    query_id: str | None
    user: TelegramUser
    chat: TelegramChat | None
    chat_type: str | None
    chat_instance: str | None
    start_param: str | None
    auth_date: datetime
    raw: str


def parse_init_data(init_data: str) -> TelegramInitData:
    logger.info("parse_init_data: received init_data length=%s", len(init_data or ""))
    if not init_data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing init data")

    data = dict(parse_qsl(init_data, keep_blank_values=True))
    logger.info("parse_init_data: keys=%s", sorted(list(data.keys())))
    hash_value = data.pop("hash", None)
    if not hash_value:
        logger.warning("parse_init_data: missing hash")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing hash")

    settings = get_settings()
    logger.info("parse_init_data: bot_token_present=%s", bool(settings.bot_token))
    if not settings.bot_token:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Bot token not configured")

    secret_key = hmac.new(b"WebAppData", settings.bot_token.encode(), hashlib.sha256).digest()
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    logger.info("parse_init_data: data_check_string=%r", data_check_string)
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    logger.info(
        "parse_init_data: received_hash_prefix=%s computed_hash_prefix=%s",
        (hash_value or "")[:10],
        computed_hash[:10],
    )
    if not hmac.compare_digest(computed_hash, hash_value):
        logger.warning("parse_init_data: signature mismatch")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid init data signature")

    auth_date_raw = data.get("auth_date")
    logger.info("parse_init_data: auth_date_raw=%s", auth_date_raw)
    if not auth_date_raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing auth_date")

    auth_dt = datetime.fromtimestamp(int(auth_date_raw), tz=timezone.utc)
    if datetime.now(timezone.utc) - auth_dt > timedelta(hours=24):
        logger.warning("parse_init_data: init data expired: auth_dt=%s now=%s", auth_dt.isoformat(), datetime.now(timezone.utc).isoformat())
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Init data expired")

    user_raw = data.get("user")
    logger.info("parse_init_data: has_user=%s", bool(user_raw))
    if not user_raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing user info")

    try:
        user_data = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        logger.warning("parse_init_data: malformed user json: %s", user_raw[:80] if user_raw else None)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed user data") from exc

    user = TelegramUser(
        id=int(user_data["id"]),
        first_name=user_data.get("first_name"),
        last_name=user_data.get("last_name"),
        username=user_data.get("username"),
        language_code=user_data.get("language_code"),
    )

    chat_obj: TelegramChat | None = None
    chat_raw = data.get("chat")
    if chat_raw:
        try:
            chat_data = json.loads(chat_raw)
            chat_obj = TelegramChat(
                id=int(chat_data.get("id")) if chat_data.get("id") is not None else None,
                type=chat_data.get("type"),
                title=chat_data.get("title"),
                username=chat_data.get("username"),
            )
        except Exception as exc:
            logger.warning("parse_init_data: malformed chat json: %s err=%s", chat_raw[:80], exc)
            chat_obj = None
    elif data.get("chat_type"):
        chat_obj = TelegramChat(id=None, type=data.get("chat_type"))

    start_param = data.get("start_param")
    chat_type = data.get("chat_type") or getattr(chat_obj, "type", None)
    chat_instance = data.get("chat_instance")

    logger.info(
        "parse_init_data: ok user_id=%s auth_ts=%s chat_type=%s start_param=%s",
        user.id,
        int(auth_dt.timestamp()),
        chat_type,
        start_param,
    )
    return TelegramInitData(
        query_id=data.get("query_id"),
        user=user,
        chat=chat_obj,
        chat_type=chat_type,
        chat_instance=chat_instance,
        start_param=start_param,
        auth_date=auth_dt,
        raw=init_data,
    )
