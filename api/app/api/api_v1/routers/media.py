from __future__ import annotations

import io
import uuid
import re
import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Depends

from api.app.core.s3 import put_bytes
# Try to import real auth dependency; fall back to a no-op to avoid ImportError during boot
try:
    from api.app.dependencies.auth import get_current_user  # type: ignore
except Exception:
    async def get_current_user():
        return None  # no-op auth (used only if real dependency is unavailable)


router = APIRouter(prefix="/media", tags=["media"])

_SAFE_RE = re.compile(r"[^a-zA-Z0-9_.-]+")
MAX_UPLOAD_MB = int(os.getenv("MEDIA_MAX_UPLOAD_MB", "25"))


def _safe_key(filename: str, prefix: str | None = None) -> str:
    base = filename or "file"
    base = base.strip().replace(" ", "_")
    base = _SAFE_RE.sub("-", base)
    rid = uuid.uuid4().hex[:8]
    key = f"{rid}-{base}"
    if prefix:
        prefix = prefix.strip("/")
        key = f"{prefix}/{key}"
    return key


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    prefix: str | None = Form(None),
    user: object | None = Depends(get_current_user),
):
    try:
        content = await file.read()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to read file") from exc

    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty")
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File is too large (max {MAX_UPLOAD_MB} MB)",
        )

    key = _safe_key(file.filename or "image", prefix or "uploads")
    try:
        url = put_bytes(content, key=key, content_type=file.content_type)
    except Exception as exc:
        # Bubble up more context to help debug in logs/client
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"failed to upload s3: {type(exc).__name__}: {exc}"
        ) from exc

    return {"url": url, "key": key}
