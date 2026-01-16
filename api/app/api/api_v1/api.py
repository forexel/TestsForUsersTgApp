from fastapi import APIRouter

from api.app.api.api_v1.routers.tests import router as tests_router
from api.app.api.api_v1.routers.media import router as media_router
from api.app.api.api_v1.routers.stats import router as stats_router
from api.app.api.api_v1.routers.admin import router as admin_router

api_router = APIRouter()
api_router.include_router(tests_router)
api_router.include_router(media_router)
api_router.include_router(stats_router)
api_router.include_router(admin_router)
