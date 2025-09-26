from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import UUID, BigInteger, Boolean, DateTime, Enum as SqlEnum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.db.session import Base


class TestType(str, Enum):
    SINGLE = "single"
    CARDS = "cards"
    MULTI = "multi"


class Test(Base):
    __tablename__ = "tests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[TestType] = mapped_column(SqlEnum(TestType, name="test_type"), nullable=False)
    description: Mapped[str | None] = mapped_column(Text())
    is_public: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    created_by: Mapped[int] = mapped_column(BigInteger(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    questions: Mapped[list[Question]] = relationship(
        "Question",
        back_populates="test",
        cascade="all, delete-orphan",
        order_by="Question.order_num",
    )
    answers: Mapped[list[Answer]] = relationship(
        "Answer",
        back_populates="test",
        cascade="all, delete-orphan",
        order_by="Answer.order_num",
    )
    results: Mapped[list[Result]] = relationship(
        "Result",
        back_populates="test",
        cascade="all, delete-orphan",
        order_by="Result.title",
    )


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tests.id", ondelete="CASCADE"), nullable=False)
    order_num: Mapped[int] = mapped_column(Integer(), nullable=False)
    text: Mapped[str] = mapped_column(Text(), nullable=False)

    test: Mapped[Test] = relationship("Test", back_populates="questions")
    answers: Mapped[list[Answer]] = relationship(
        "Answer",
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="Answer.order_num",
    )


class Result(Base):
    __tablename__ = "results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tests.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text())
    min_score: Mapped[int | None] = mapped_column(Integer())
    max_score: Mapped[int | None] = mapped_column(Integer())

    test: Mapped[Test] = relationship("Test", back_populates="results")
    answers: Mapped[list[Answer]] = relationship("Answer", back_populates="result")


class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tests.id", ondelete="CASCADE"), nullable=False)
    question_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), nullable=True
    )
    result_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("results.id", ondelete="SET NULL"))
    order_num: Mapped[int] = mapped_column(Integer(), nullable=False)
    text: Mapped[str | None] = mapped_column(Text())
    image_url: Mapped[str | None] = mapped_column(Text())
    weight: Mapped[int | None] = mapped_column(Integer())
    is_correct: Mapped[bool | None] = mapped_column(Boolean())

    test: Mapped[Test] = relationship("Test", back_populates="answers")
    question: Mapped[Question | None] = relationship("Question", back_populates="answers")
    result: Mapped[Result | None] = relationship("Result", back_populates="answers")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(BigInteger(), nullable=False)
    test_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tests.id", ondelete="CASCADE"), nullable=False)
    state: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    total_score: Mapped[int | None] = mapped_column(Integer())
    result_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("results.id", ondelete="SET NULL"))

    test: Mapped[Test] = relationship("Test")
    result: Mapped[Result | None] = relationship("Result")
