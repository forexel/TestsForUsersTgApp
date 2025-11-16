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

    base_fields = {"slug", "title", "type", "description", "is_public"}
    test = Test(
        **{k: v for k, v in data.items() if k in base_fields},
        created_by=created_by,
        created_by_username=created_by_username,
    )
    db.add(test)

    for result in results_data:
        result_obj = Result(test=test, **result)
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

    if "results" in data:
        test.results.clear()
        db.flush()
        for result in data["results"]:
            db.add(Result(test=test, **result))

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
