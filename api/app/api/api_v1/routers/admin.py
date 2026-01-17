from __future__ import annotations

from datetime import datetime, timedelta, timezone
from io import BytesIO
import secrets
import hashlib
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.orm import Session
from openpyxl import Workbook

from api.app.db.session import get_db
from api.app.dependencies.auth import get_admin_user
from api.app.models import AdminToken, AdminUser, Test, TestEvent, TestResponse
from api.app.schemas.admin import (
    AdminLoginRequest,
    AdminLoginResponse,
    AdminQuestion,
    AdminResponseRow,
    AdminTestFunnel,
    AdminTestListItem,
    AdminTestReport,
    AdminFunnelStep,
)

router = APIRouter(prefix="/admin", tags=["admin"], redirect_slashes=False)


def _hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return digest.hex()


def _verify_password(raw: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    return _hash_password(raw, salt) == digest


def _issue_token(db: Session, admin: AdminUser) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    db.add(AdminToken(admin_id=admin.id, token=token, expires_at=expires_at))
    db.commit()
    return token


def _apply_admin_scope(query, admin: AdminUser):
    if admin.scope == "owner":
        if admin.username == "admin":
            return query
        owner = admin.owner_username or admin.username
        return query.filter(Test.created_by_username == owner)
    return query


@router.post("/login", response_model=AdminLoginResponse)
def admin_login(payload: AdminLoginRequest, db: Session = Depends(get_db)):
    admin = db.query(AdminUser).filter(AdminUser.username == payload.username).first()
    if not admin or not _verify_password(payload.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = _issue_token(db, admin)
    return AdminLoginResponse(token=token, username=admin.username, scope=admin.scope)


@router.get("/tests", response_model=list[AdminTestListItem])
def list_tests(admin: AdminUser = Depends(get_admin_user), db: Session = Depends(get_db)):
    tests = _apply_admin_scope(db.query(Test), admin).order_by(Test.created_at.desc()).all()
    return [
        AdminTestListItem(
            id=t.id,
            slug=t.slug,
            title=t.title,
            created_by_username=t.created_by_username,
            lead_enabled=t.lead_enabled,
            lead_collect_name=t.lead_collect_name,
            lead_collect_phone=t.lead_collect_phone,
            lead_collect_email=t.lead_collect_email,
            lead_collect_site=t.lead_collect_site,
            lead_site_url=t.lead_site_url,
        )
        for t in tests
    ]


def _build_funnel(test_id, question_count: int, db: Session) -> AdminTestFunnel:
    screen_opens = (
        db.query(func.count(TestEvent.id))
        .filter(TestEvent.test_id == test_id, TestEvent.event_type == "screen_open")
        .scalar()
        or 0
    )
    answers = (
        db.query(TestEvent.question_index, func.count(TestEvent.id))
        .filter(TestEvent.test_id == test_id, TestEvent.event_type == "answer")
        .group_by(TestEvent.question_index)
        .all()
    )
    answers_map = {row[0]: row[1] for row in answers if row[0] is not None}
    answer_steps = [
        AdminFunnelStep(question_index=i, count=int(answers_map.get(i, 0)))
        for i in range(1, max(question_count, 1) + 1)
    ]
    lead_form_submits = (
        db.query(func.count(TestEvent.id))
        .filter(TestEvent.test_id == test_id, TestEvent.event_type == "lead_form_submit")
        .scalar()
        or 0
    )
    site_clicks = (
        db.query(func.count(TestEvent.id))
        .filter(TestEvent.test_id == test_id, TestEvent.event_type == "site_click")
        .scalar()
        or 0
    )
    return AdminTestFunnel(
        screen_opens=int(screen_opens),
        answers=answer_steps,
        lead_form_submits=int(lead_form_submits),
        site_clicks=int(site_clicks),
    )


def _responses_for_test(test_id, db: Session) -> list[AdminResponseRow]:
    rows = (
        db.query(TestResponse)
        .filter(TestResponse.test_id == test_id)
        .order_by(TestResponse.created_at.desc())
        .all()
    )
    out: list[AdminResponseRow] = []
    for row in rows:
        answers: dict[str, str] = {}
        raw = row.answers or {}
        if isinstance(raw, list):
            for entry in raw:
                if not isinstance(entry, dict):
                    continue
                qid = str(entry.get("question_id") or entry.get("order_num") or "")
                answers[qid] = str(entry.get("answer_text") or "")
        elif isinstance(raw, dict):
            answers = {str(k): str(v) for k, v in raw.items()}
        out.append(
            AdminResponseRow(
                user_id=row.user_id,
                user_username=row.user_username,
                result_title=row.result_title,
                answers=answers,
                lead_name=row.lead_name,
                lead_phone=row.lead_phone,
                lead_email=row.lead_email,
                lead_site=row.lead_site,
                lead_form_submitted=row.lead_form_submitted,
                lead_site_clicked=row.lead_site_clicked,
            )
        )
    return out


@router.get("/tests/{test_id}/report", response_model=AdminTestReport)
def get_test_report(test_id: uuid.UUID, admin: AdminUser = Depends(get_admin_user), db: Session = Depends(get_db)):
    query = _apply_admin_scope(db.query(Test), admin)
    test = query.filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    questions = [
        AdminQuestion(
            id=str(q.id),
            text=q.text,
            order_num=q.order_num,
            answers=[a.text or "" for a in sorted(q.answers, key=lambda a: a.order_num)],
        )
        for q in sorted(test.questions, key=lambda q: q.order_num)
    ]
    if not questions and test.type == "cards":
        answers = [a.text or "" for a in sorted(test.answers, key=lambda a: a.order_num)]
        questions = [AdminQuestion(id="card", text="Выбранная карта", order_num=1, answers=answers)]
    funnel = _build_funnel(test.id, len(questions), db)
    responses = _responses_for_test(test.id, db)
    return AdminTestReport(
        test=AdminTestListItem(
            id=test.id,
            slug=test.slug,
            title=test.title,
            created_by_username=test.created_by_username,
            lead_enabled=test.lead_enabled,
            lead_collect_name=test.lead_collect_name,
            lead_collect_phone=test.lead_collect_phone,
            lead_collect_email=test.lead_collect_email,
            lead_collect_site=test.lead_collect_site,
            lead_site_url=test.lead_site_url,
        ),
        questions=questions,
        funnel=funnel,
        responses=responses,
    )


@router.get("/tests/{test_id}/export")
def export_test_report(test_id: uuid.UUID, admin: AdminUser = Depends(get_admin_user), db: Session = Depends(get_db)):
    query = _apply_admin_scope(db.query(Test), admin)
    test = query.filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    questions = sorted(test.questions, key=lambda q: q.order_num)
    responses = _responses_for_test(test.id, db)

    wb = Workbook()
    ws = wb.active
    ws.title = "Responses"

    headers = ["telegram_id", "result_title"]
    headers.extend([q.text for q in questions])
    if test.lead_enabled:
        if test.lead_collect_name:
            headers.append("lead_name")
        if test.lead_collect_phone:
            headers.append("lead_phone")
        if test.lead_collect_email:
            headers.append("lead_email")
        if test.lead_collect_site:
            headers.append("lead_site")
            headers.append("lead_site_clicked")
    ws.append(headers)

    for row in responses:
        values = [row.user_id, row.result_title or ""]
        for q in questions:
            key = str(q.id)
            values.append(row.answers.get(key) or "")
        if test.lead_enabled:
            if test.lead_collect_name:
                values.append(row.lead_name or "")
            if test.lead_collect_phone:
                values.append(row.lead_phone or "")
            if test.lead_collect_email:
                values.append(row.lead_email or "")
            if test.lead_collect_site:
                values.append(row.lead_site or "")
                values.append("yes" if row.lead_site_clicked else "no")
        ws.append(values)

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"test-{test.slug}-responses.xlsx"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )
