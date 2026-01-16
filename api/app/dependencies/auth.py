from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger("auth")

from api.app.core.config import get_settings
from api.app.core.telegram import TelegramInitData, parse_init_data
from api.app.db.session import get_db
from api.app.models import AdminToken, AdminUser


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


async def get_admin_user(
    db: Session = Depends(get_db),
    x_admin_token: str = Header(default=""),
) -> AdminUser:
    if not x_admin_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing admin token")
    token = (
        db.query(AdminToken)
        .filter(AdminToken.token == x_admin_token)
        .order_by(AdminToken.created_at.desc())
        .first()
    )
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")
    if token.expires_at and token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin token expired")
    admin = db.query(AdminUser).filter(AdminUser.id == token.admin_id).first()
    if not admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin not found")
    return admin
