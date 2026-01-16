from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from api.app.models import Answer, Question, Result, Test, TestType
from api.app.schemas import TestCreate, TestUpdate


def _dump(model):
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def create_test(db: Session, payload: TestCreate, *, created_by: int, created_by_username: str | None = None) -> Test:
    data = _dump(payload)
    # normalize incoming type to enum value (lowercase)
    if "type" in data:
        t = data["type"]
        if isinstance(t, TestType):
            data["type"] = t.value
        elif isinstance(t, str):
            data["type"] = t.lower()
    questions_data = data.pop("questions", [])
    answers_data = data.pop("answers", [])
    results_data = data.pop("results", [])

    base_fields = {
        "slug",
        "title",
        "type",
        "description",
        "is_public",
        "bg_color",
        "lead_enabled",
        "lead_collect_name",
        "lead_collect_phone",
        "lead_collect_email",
        "lead_collect_site",
        "lead_site_url",
    }
    test = Test(
        **{k: v for k, v in data.items() if k in base_fields},
        created_by=created_by,
        created_by_username=created_by_username,
    )
    db.add(test)

    for idx, result in enumerate(results_data):
        payload = dict(result)
        if not payload.get("order_num"):
            payload["order_num"] = idx + 1
        result_obj = Result(test=test, **payload)
        db.add(result_obj)
        db.flush()

    for question in questions_data:
        answers = question.pop("answers", [])
        question_obj = Question(test=test, **question)
        db.add(question_obj)
        db.flush()
        for answer in answers:
            answer_obj = Answer(test=test, question=question_obj, **answer)
            db.add(answer_obj)

    for answer in answers_data:
        answer_obj = Answer(test=test, **answer)
        db.add(answer_obj)

    db.flush()
    db.refresh(test)
    return test


def get_test_by_id(db: Session, test_id: uuid.UUID) -> Test | None:
    return db.query(Test).filter(Test.id == test_id).first()


def get_test_by_slug(db: Session, slug: str) -> Test | None:
    return db.query(Test).filter(Test.slug == slug).first()


def list_tests(db: Session) -> list[Test]:
    return db.query(Test).order_by(Test.created_at.desc()).all()


def update_test(db: Session, test: Test, payload: TestUpdate) -> Test:
    data = {k: v for k, v in _dump(payload).items() if v is not None}

    if "title" in data:
        test.title = data["title"]
    if "description" in data:
        test.description = data["description"]
    if "is_public" in data:
        test.is_public = data["is_public"]
    if "bg_color" in data:
        test.bg_color = data["bg_color"]
    if "lead_enabled" in data:
        test.lead_enabled = data["lead_enabled"]
    if "lead_collect_name" in data:
        test.lead_collect_name = data["lead_collect_name"]
    if "lead_collect_phone" in data:
        test.lead_collect_phone = data["lead_collect_phone"]
    if "lead_collect_email" in data:
        test.lead_collect_email = data["lead_collect_email"]
    if "lead_collect_site" in data:
        test.lead_collect_site = data["lead_collect_site"]
    if "lead_site_url" in data:
        test.lead_site_url = data["lead_site_url"]

    if "results" in data:
        test.results.clear()
        db.flush()
        for idx, result in enumerate(data["results"]):
            payload = dict(result)
            if not payload.get("order_num"):
                payload["order_num"] = idx + 1
            db.add(Result(test=test, **payload))

    if "questions" in data:
        test.questions.clear()
        db.flush()
        for question in data["questions"]:
            answers = question.pop("answers", [])
            question_obj = Question(test=test, **question)
            db.add(question_obj)
            db.flush()
            for answer in answers:
                db.add(Answer(test=test, question=question_obj, **answer))

    if "answers" in data:
        # answers without question (cards)
        test.answers = [Answer(test=test, **answer) for answer in data["answers"]]

    db.flush()
    db.refresh(test)
    return test


def delete_test(db: Session, test: Test) -> None:
    db.delete(test)
    db.flush()
