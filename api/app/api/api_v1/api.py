from fastapi import APIRouter

from api.app.api.api_v1.routers.tests import router as tests_router

api_router = APIRouter()
api_router.include_router(tests_router)
