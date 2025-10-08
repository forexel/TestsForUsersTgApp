from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger("auth")

from api.app.core.config import get_settings
from api.app.core.telegram import TelegramInitData, parse_init_data
from api.app.db.session import get_db


from fastapi import Depends, Header, HTTPException, status, Request
import logging

logger = logging.getLogger("auth")

async def get_init_data(request: Request, x_telegram_init_data: str = Header(default="")):
    """Поднимаем initData из заголовка, логируем UA и путь для диагностики Android WebView."""
    if not x_telegram_init_data:
        ua = request.headers.get("user-agent", "?")
        logger.warning("AUTH: missing X-Telegram-Init-Data ua=%s path=%s", ua, request.url.path)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Telegram init data")
    try:
        init = parse_init_data(x_telegram_init_data)
        logger.info("AUTH: ok user=%s ua=%s path=%s", getattr(init.user, "id", None), request.headers.get("user-agent", "?"), request.url.path)
        return init
    except Exception as exc:
        ua = request.headers.get("user-agent", "?")
        logger.exception("AUTH: invalid init data ua=%s path=%s err=%s", ua, request.url.path, exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Telegram init data")


async def get_current_admin(init_data: TelegramInitData = Depends(get_init_data)) -> TelegramInitData:
    settings = get_settings()
    if init_data.user.id not in settings.admin_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not an admin")
    return init_data


async def get_admin_db(init_data: TelegramInitData = Depends(get_current_admin), db: Session = Depends(get_db)) -> Session:
    # Access to DB after admin validation
    return db
