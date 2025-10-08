from __future__ import annotations

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi import Request
from fastapi import Response

import re
from typing import Optional

from api.app.core.telegram import TelegramInitData
from api.app.crud.tests import create_test, delete_test, get_test_by_id, get_test_by_slug, list_tests, update_test
from api.app.db.session import get_db
from api.app.dependencies.auth import get_current_admin, get_init_data
from api.app.schemas import SlugResponse, TestCreate, TestRead, TestUpdate
from api.app.models.test_models import Test as TestModel

logger = logging.getLogger("tests")

router = APIRouter(prefix="/tests", tags=["tests"], redirect_slashes=False,)

_SLUG_RE = re.compile(r"[^a-z0-9-]+")

def _slugify(text: Optional[str]) -> str:
    if not text:
        return ""
    s = text.strip().lower()
    s = s.replace(" ", "-")
    s = _SLUG_RE.sub("", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s

def _ensure_unique_slug(db: Session, base: str) -> str:
    # if free — use as-is
    if not get_test_by_slug(db, base):
        return base
    # try numeric suffixes -2, -3, ... -20
    for i in range(2, 21):
        candidate = f"{base}-{i}"
        if not get_test_by_slug(db, candidate):
            return candidate
    # fallback to random short suffix
    short = uuid.uuid4().hex[:6]
    candidate = f"{base}-{short}"
    if not get_test_by_slug(db, candidate):
        return candidate
    # extreme fallback
    return f"{base}-{uuid.uuid4().hex[:8]}"


@router.get("/", response_model=list[TestRead])
def get_tests(
    db: Session = Depends(get_db),
    _: TelegramInitData = Depends(get_current_admin),
):
    return [TestRead.from_orm(t) for t in list_tests(db)]


# Explicit non-slash path to avoid proxy/redirect quirks
@router.get("/all", response_model=list[TestRead])
def get_tests_all(
    db: Session = Depends(get_db),
    _: TelegramInitData = Depends(get_current_admin),
):
    out = [TestRead.from_orm(t) for t in list_tests(db)]
    logger.info("GET /tests/all -> %d items", len(out))
    return out


# Endpoint to get only the tests created by the current user
@router.get("/mine/", response_model=list[TestRead])
@router.get("/mine", response_model=list[TestRead])
def get_my_tests(
    request: Request,    
    db: Session = Depends(get_db),
    init_data: TelegramInitData = Depends(get_init_data),
):
    logger.info("GET /tests/mine by user=%s ua=%s", getattr(init_data.user, "id", None), request.headers.get("user-agent", "?"))
    rows = (
        db.query(TestModel)
        .filter(getattr(TestModel, "created_by") == init_data.user.id)
        .order_by(getattr(TestModel, "created_at").desc())
        .all()
    )
    logger.info("/tests/mine user=%s -> %d items slugs=%s", getattr(init_data.user, "id", None), len(rows), [getattr(t, "slug", None) for t in rows])
    return [TestRead.from_orm(t) for t in rows]

@router.get("/public", response_model=list[TestRead])
def get_public_tests(db: Session = Depends(get_db)):
    # Открытый список: только опубликованные тесты
    tests = [t for t in list_tests(db) if getattr(t, "is_public", False)]
    out = [TestRead.from_orm(t) for t in tests]
    logger.info("GET /tests/public -> %d items slugs=%s", len(out), [getattr(t, "slug", None) for t in tests])
    return out

@router.post("", response_model=TestRead, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=TestRead, status_code=status.HTTP_201_CREATED)
def create_test_handler(
    payload: TestCreate,
    db: Session = Depends(get_db),
    init_data: TelegramInitData = Depends(get_init_data),
    response: Response = None,  # добавили
):
    # --- slug normalization & auto-generation ---
    proposed = (payload.slug or "").strip()
    if not proposed:
        proposed = _slugify(payload.title)
    else:
        proposed = _slugify(proposed)
    if not proposed:
        proposed = f"test-{uuid.uuid4().hex[:6]}"
    proposed = _ensure_unique_slug(db, proposed)
    # mutate payload so downstream crud sees the final slug
    try:
        payload.slug = proposed  # type: ignore[attr-defined]
    except Exception:
        pass
    test = create_test(db, payload, created_by=init_data.user.id)
    db.commit()
    db.refresh(test)
    logger.info("POST /tests created id=%s slug=%s by=%s", getattr(test, "id", None), getattr(test, "slug", None), getattr(init_data.user, "id", None))
    # safety: если CRUD внезапно не записал created_by — досохраним
    if getattr(test, "created_by", None) is None:
        setattr(test, "created_by", init_data.user.id)
        db.add(test)
        db.commit()
        db.refresh(test)
    logger.info("/tests saved id=%s slug=%s created_by=%s", getattr(test, "id", None), getattr(test, "slug", None), getattr(test, "created_by", None))
    out = TestRead.from_orm(test)
    # Отдаём модель как есть, а заголовок ставим через Response — FastAPI сам сериализует корректно
    response.status_code = status.HTTP_201_CREATED
    response.headers["Location"] = f"/api/v1/tests/slug/{getattr(test, 'slug', '')}"
    return out


@router.get("/{test_id}", response_model=TestRead)
def get_test_handler(
    test_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: TelegramInitData = Depends(get_current_admin),
):
    test = get_test_by_id(db, test_id)
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    return TestRead.from_orm(test)


@router.patch("/{test_id}", response_model=TestRead)
def update_test_handler(
    test_id: uuid.UUID,
    payload: TestUpdate,
    db: Session = Depends(get_db),
    _: TelegramInitData = Depends(get_current_admin),
):
    test = get_test_by_id(db, test_id)
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    updated = update_test(db, test, payload)
    db.commit()
    db.refresh(updated)
    return TestRead.from_orm(updated)


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test_handler(
    test_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: TelegramInitData = Depends(get_current_admin),
):
    test = get_test_by_id(db, test_id)
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    delete_test(db, test)
    db.commit()


@router.get("/slug/{slug}", response_model=TestRead)
def get_test_by_slug_handler(
    slug: str,
    db: Session = Depends(get_db),
    _: TelegramInitData = Depends(get_current_admin),
):
    test = get_test_by_slug(db, slug)
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    logger.info("GET /tests/slug/%s -> found id=%s", slug, getattr(test, "id", None))
    return TestRead.from_orm(test)


@router.get("/slug/{slug}/public", response_model=TestRead)
def get_public_test(slug: str, db: Session = Depends(get_db)):
    test = get_test_by_slug(db, slug)
    if not test or not test.is_public:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Public test not found")
    logger.info("GET /tests/slug/%s/public -> found id=%s", slug, getattr(test, "id", None))
    return TestRead.from_orm(test)


@router.post("/slug/check", response_model=SlugResponse)
def check_slug(
    payload: SlugResponse,
    db: Session = Depends(get_db),
    _: TelegramInitData = Depends(get_current_admin),
):
    exists = get_test_by_slug(db, payload.slug)
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug already in use")
    return payload
