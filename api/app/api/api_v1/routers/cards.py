

from __future__ import annotations
import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from api.app.utils.image_processing import compress_image
from api.app.services.storage import upload_bytes

router = APIRouter(prefix="/cards", tags=["cards"])

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "25"))
PUBLIC_BASE = os.getenv("S3_PUBLIC_BASE_URL", "http://minio:9000/test-media")

@router.post("/upload-image")
async def upload_card_image(file: UploadFile = File(...)):
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")
    try:
        optimized, content_type = compress_image(raw)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bad image: {e}")

    key = upload_bytes(optimized, content_type)
    return {
        "key": key,
        "url": f"{PUBLIC_BASE}/{key}",
        "content_type": content_type,
        "size": len(optimized),
    }