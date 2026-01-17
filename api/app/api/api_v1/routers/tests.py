from __future__ import annotations

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from fastapi import Request
from fastapi import Response

import re
from typing import Optional

from api.app.core.config import get_settings
from api.app.core.telegram import TelegramInitData, parse_init_data
from api.app.crud.tests import create_test, delete_test, get_test_by_id, get_test_by_slug, list_tests, update_test
from api.app.db.session import get_db
from api.app.dependencies.auth import get_current_admin, get_init_data
from api.app.schemas import SlugResponse, TestCreate, TestLogCreate, TestRead, TestUpdate
from api.app.schemas.responses import LeadUpdate, TestEventCreate, TestResponseCreate
from api.app.models.test_models import Test as TestModel
from api.app.models.test_models import TestEvent, TestResponse, TestRunLog

logger = logging.getLogger("tests")

router = APIRouter(prefix="/tests", tags=["tests"], redirect_slashes=False,)

_SLUG_RE = re.compile(r"[^a-z0-9-]+")
_SRC_RE = re.compile(r"__src_(-?\d+)")

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


def _is_admin(user_id: int | None) -> bool:
    if user_id is None:
        return False
    settings = get_settings()
    return user_id in settings.admin_ids


def _ensure_owner_or_admin(test: TestModel, init_data: TelegramInitData):
    if getattr(test, "created_by", None) == init_data.user.id:
        return
    if _is_admin(init_data.user.id):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _build_share_link(slug: str) -> str:
    settings = get_settings()
    username = settings.bot_username
    if username:
        return f"https://t.me/{username}?start=run_{slug}"
    return f"run_{slug}"


def _maybe_init_data(request: Request) -> TelegramInitData | None:
    raw_init = request.headers.get("X-Telegram-Init-Data") or ""
    if not raw_init:
        return None
    try:
        return parse_init_data(raw_init)
    except HTTPException:
        return None


def _validate_lead_fields(test: TestModel, payload: LeadUpdate) -> None:
    if not test.lead_enabled:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Lead collection disabled")
    if payload.lead_name is not None:
        if not test.lead_collect_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Lead name disabled")
        if len(payload.lead_name) > 10:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Name too long")
    if payload.lead_phone is not None:
        if not test.lead_collect_phone:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Lead phone disabled")
        if not re.fullmatch(r"\\+7\\d{10}", payload.lead_phone):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid phone")
    if payload.lead_email is not None:
        if not test.lead_collect_email:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Lead email disabled")
        if len(payload.lead_email) > 15:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Email too long")
        if not re.fullmatch(r"[^@\\s]+@[A-Za-z0-9-]+\\.[A-Za-z0-9.-]+", payload.lead_email):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid email")
    if payload.lead_site is not None:
        if not test.lead_collect_site:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Lead site disabled")
    if payload.lead_site_clicked is not None and not test.lead_collect_site:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Lead site disabled")


def _extract_source(init_data: TelegramInitData) -> tuple[int, str | None]:
    chat = getattr(init_data, "chat", None)
    chat_type = getattr(chat, "type", None) or getattr(init_data, "chat_type", None)
    chat_id = getattr(chat, "id", None)
    if chat_type in {"group", "supergroup", "channel"} and chat_id is not None:
        try:
            return int(chat_id), chat_type
        except (TypeError, ValueError):
            return 0, chat_type
    start_param = getattr(init_data, "start_param", None) or ""
    if start_param:
        m = _SRC_RE.search(start_param)
        if m and m.group(1):
            try:
                return int(m.group(1)), chat_type or "group"
            except (TypeError, ValueError):
                return 0, chat_type
    return 0, chat_type


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
    payload.is_public = True
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
    test = create_test(
        db,
        payload,
        created_by=init_data.user.id,
        created_by_username=getattr(init_data.user, "username", None),
    )
    db.commit()
    db.refresh(test)
    logger.info("POST /tests created id=%s slug=%s by=%s", getattr(test, "id", None), getattr(test, "slug", None), getattr(init_data.user, "id", None))
    # safety: если CRUD внезапно не записал created_by — досохраним
    if getattr(test, "created_by", None) is None:
        setattr(test, "created_by", init_data.user.id)
    if getattr(test, "created_by_username", None) is None and getattr(init_data.user, "username", None):
        setattr(test, "created_by_username", init_data.user.username)
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
    init_data: TelegramInitData = Depends(get_init_data),
):
    test = get_test_by_id(db, test_id)
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    _ensure_owner_or_admin(test, init_data)
    return TestRead.from_orm(test)


@router.patch("/{test_id}", response_model=TestRead)
def update_test_handler(
    test_id: uuid.UUID,
    payload: TestUpdate,
    db: Session = Depends(get_db),
    init_data: TelegramInitData = Depends(get_init_data),
):
    test = get_test_by_id(db, test_id)
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    _ensure_owner_or_admin(test, init_data)
    if payload.is_public is False:
        payload.is_public = True
    updated = update_test(db, test, payload)
    db.commit()
    db.refresh(updated)
    return TestRead.from_orm(updated)


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test_handler(
    test_id: uuid.UUID,
    db: Session = Depends(get_db),
    init_data: TelegramInitData = Depends(get_init_data),
):
    test = get_test_by_id(db, test_id)
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    _ensure_owner_or_admin(test, init_data)
    delete_test(db, test)
    db.commit()


@router.get("/slug/{slug}", response_model=TestRead)
def get_test_by_slug_handler(
    slug: str,
    db: Session = Depends(get_db),
    init_data: TelegramInitData = Depends(get_init_data),
):
    test = get_test_by_slug(db, slug)
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    _ensure_owner_or_admin(test, init_data)
    logger.info("GET /tests/slug/%s -> found id=%s", slug, getattr(test, "id", None))
    return TestRead.from_orm(test)


@router.get("/slug/{slug}/public", response_model=TestRead)
def get_public_test(slug: str, request: Request, db: Session = Depends(get_db)):
    test = get_test_by_slug(db, slug)
    if not test or not test.is_public:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Public test not found")
    init_data = None
    raw_init = request.headers.get("X-Telegram-Init-Data") or ""
    if raw_init:
        try:
            init_data = parse_init_data(raw_init)
        except HTTPException:
            init_data = None
    if init_data:
        source_id, source_type = _extract_source(init_data)
        user_id = init_data.user.id
        user_username = getattr(init_data.user, "username", None)
    else:
        source_id, source_type = 0, None
        user_id = 0
        user_username = None
    try:
        log_entry = TestRunLog(
            test=test,
            test_id=getattr(test, "id", None),
            test_slug=slug,
            link=_build_share_link(slug),
            user_id=user_id,
            user_username=user_username,
            source_chat_id=source_id,
            source_chat_type=source_type,
            test_owner_username=getattr(test, "created_by_username", None),
            event_type="open",
        )
        db.add(log_entry)
        db.commit()
    except Exception:
        db.rollback()
    logger.info("GET /tests/slug/%s/public -> found id=%s", slug, getattr(test, "id", None))
    return TestRead.from_orm(test)


@router.post("/slug/{slug}/logs", status_code=status.HTTP_201_CREATED)
def log_test_completion(
    slug: str,
    payload: TestLogCreate | None = None,
    db: Session = Depends(get_db),
    init_data: TelegramInitData = Depends(get_init_data),
):
    test = get_test_by_slug(db, slug)
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    source_id, source_type = _extract_source(init_data)
    link = _build_share_link(slug)
    event_type = (payload.event_type if payload else None) or "complete"
    if event_type not in {"open", "complete"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid event_type")
    log_entry = TestRunLog(
        test=test,
        test_id=getattr(test, "id", None),
        test_slug=slug,
        link=link,
        user_id=init_data.user.id,
        user_username=getattr(init_data.user, "username", None),
        source_chat_id=source_id,
        source_chat_type=source_type,
        test_owner_username=getattr(test, "created_by_username", None),
        event_type=event_type,
    )
    db.add(log_entry)
    db.commit()
    logger.info(
        "POST /tests/slug/%s/logs user=%s source=%s event=%s",
        slug,
        getattr(init_data.user, "id", None),
        source_id,
        event_type,
    )
    return {"status": "ok"}


@router.post("/slug/{slug}/events", status_code=status.HTTP_201_CREATED)
def log_test_event(
    slug: str,
    payload: TestEventCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    test = get_test_by_slug(db, slug)
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    init_data = _maybe_init_data(request)
    event_type = payload.event_type
    if event_type not in {"screen_open", "answer", "lead_form_submit", "site_click"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid event_type")
    if event_type == "answer" and payload.question_index is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Missing question_index")
    entry = TestEvent(
        test=test,
        test_id=getattr(test, "id", None),
        test_slug=slug,
        user_id=init_data.user.id if init_data else 0,
        event_type=event_type,
        question_index=payload.question_index,
    )
    db.add(entry)
    db.commit()
    return {"status": "ok"}


@router.post("/slug/{slug}/responses", status_code=status.HTTP_201_CREATED)
def create_test_response(
    slug: str,
    payload: TestResponseCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    test = get_test_by_slug(db, slug)
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    init_data = _maybe_init_data(request)
    answers = [a.model_dump() if hasattr(a, "model_dump") else a.dict() for a in payload.answers]
    response = TestResponse(
        test=test,
        test_id=getattr(test, "id", None),
        test_slug=slug,
        user_id=init_data.user.id if init_data else 0,
        user_username=getattr(init_data.user, "username", None) if init_data else "unauthorized",
        result_title=payload.result_title,
        answers=answers,
    )
    db.add(response)
    db.commit()
    db.refresh(response)
    return {"response_id": str(response.id)}


@router.patch("/responses/{response_id}", status_code=status.HTTP_200_OK)
def update_test_response(
    response_id: uuid.UUID,
    payload: LeadUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    response = db.query(TestResponse).filter(TestResponse.id == response_id).first()
    if not response:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Response not found")
    init_data = _maybe_init_data(request)
    if response.user_id and init_data and response.user_id != init_data.user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if response.user_id and not init_data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Telegram init data")
    test = get_test_by_id(db, response.test_id) if response.test_id else None
    if test:
        _validate_lead_fields(test, payload)
    if payload.lead_name is not None:
        response.lead_name = payload.lead_name
    if payload.lead_phone is not None:
        response.lead_phone = payload.lead_phone
    if payload.lead_email is not None:
        response.lead_email = payload.lead_email
    if payload.lead_site is not None:
        response.lead_site = payload.lead_site
    if payload.lead_form_submitted is not None:
        response.lead_form_submitted = payload.lead_form_submitted
    if payload.lead_site_clicked is not None:
        response.lead_site_clicked = payload.lead_site_clicked
    db.add(response)
    db.commit()
    return {"status": "ok"}


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
