from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from api.app.core.config import get_settings
from api.app.core.telegram import TelegramInitData, parse_init_data
from api.app.db.session import get_db


async def get_init_data(x_telegram_init_data: str = Header(default="")) -> TelegramInitData:
    return parse_init_data(x_telegram_init_data)


async def get_current_admin(init_data: TelegramInitData = Depends(get_init_data)) -> TelegramInitData:
    settings = get_settings()
    if init_data.user.id not in settings.admin_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not an admin")
    return init_data


async def get_admin_db(init_data: TelegramInitData = Depends(get_current_admin), db: Session = Depends(get_db)) -> Session:
    # Access to DB after admin validation
    return db
