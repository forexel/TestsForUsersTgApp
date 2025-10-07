from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict

from api.app.models import TestType


class ResultBase(BaseModel):
    title: str
    description: str | None = None
    min_score: int | None = None
    max_score: int | None = None


class ResultCreate(ResultBase):
    pass


class ResultRead(ResultBase):
    id: uuid.UUID

    class Config:
        orm_mode = True
        json_encoders = {uuid.UUID: str}


class AnswerBase(BaseModel):
    order_num: int
    text: str | None = None
    explanation_title: str | None = None
    explanation_text: str | None = None
    image_url: str | None = None
    weight: int | None = None
    is_correct: bool | None = None
    result_id: uuid.UUID | None = None
    question_id: uuid.UUID | None = None


class AnswerCreate(AnswerBase):
    pass


class AnswerRead(AnswerBase):
    id: uuid.UUID

    class Config:
        orm_mode = True
        json_encoders = {uuid.UUID: str}


class QuestionBase(BaseModel):
    order_num: int
    text: str


class QuestionCreate(QuestionBase):
    answers: list[AnswerCreate] = Field(default_factory=list)


class QuestionRead(QuestionBase):
    id: uuid.UUID
    answers: list[AnswerRead]

    class Config:
        orm_mode = True
        json_encoders = {uuid.UUID: str}


class TestBase(BaseModel):
    title: str
    type: TestType
    description: str | None = None
    is_public: bool = False


class TestCreate(TestBase):
    slug: str | None = None
    questions: list[QuestionCreate] = Field(default_factory=list)
    answers: list[AnswerCreate] = Field(default_factory=list)
    results: list[ResultCreate] = Field(default_factory=list)


class TestUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    is_public: bool | None = None
    questions: list[QuestionCreate] | None = None
    answers: list[AnswerCreate] | None = None
    results: list[ResultCreate] | None = None


class TestRead(TestBase):
    id: uuid.UUID
    slug: str
    created_by: int
    created_at: datetime
    questions: list[QuestionRead]
    answers: list[AnswerRead]
    results: list[ResultRead]

    class Config:
        orm_mode = True
        json_encoders = {uuid.UUID: str, datetime: lambda dt: dt.isoformat()}


class SlugResponse(BaseModel):
    slug: str
