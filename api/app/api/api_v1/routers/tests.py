from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.app.core.telegram import TelegramInitData
from api.app.crud.tests import create_test, delete_test, get_test_by_id, get_test_by_slug, list_tests, update_test
from api.app.db.session import get_db
from api.app.dependencies.auth import get_current_admin
from api.app.schemas import SlugResponse, TestCreate, TestRead, TestUpdate

router = APIRouter(prefix="/tests", tags=["tests"])


@router.get("/", response_model=list[TestRead])
def get_tests(
    db: Session = Depends(get_db),
    _: TelegramInitData = Depends(get_current_admin),
):
    return list_tests(db)


@router.post("/", response_model=TestRead, status_code=status.HTTP_201_CREATED)
def create_test_handler(
    payload: TestCreate,
    db: Session = Depends(get_db),
    init_data: TelegramInitData = Depends(get_current_admin),
):
    if get_test_by_slug(db, payload.slug):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug already in use")
    test = create_test(db, payload, created_by=init_data.user.id)
    db.commit()
    db.refresh(test)
    return test


@router.get("/{test_id}", response_model=TestRead)
def get_test_handler(
    test_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: TelegramInitData = Depends(get_current_admin),
):
    test = get_test_by_id(db, test_id)
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    return test


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
    return updated


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
    return test


@router.get("/slug/{slug}/public", response_model=TestRead)
def get_public_test(slug: str, db: Session = Depends(get_db)):
    test = get_test_by_slug(db, slug)
    if not test or not test.is_public:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Public test not found")
    return test


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
