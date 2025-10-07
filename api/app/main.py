from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.app.api.api_v1.api import api_router
from api.app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # dev: allow all; tighten for prod
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*", "X-Telegram-Init-Data"],
        expose_headers=["*"],
    )
    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
