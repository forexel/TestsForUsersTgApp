from fastapi import FastAPI

from api.app.api.api_v1.api import api_router
from api.app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
