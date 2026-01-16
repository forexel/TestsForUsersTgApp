from __future__ import annotations

from pydantic import BaseModel


class AnswerPayload(BaseModel):
    question_id: str | None = None
    question_text: str
    answer_id: str | None = None
    answer_text: str
    order_num: int | None = None


class TestResponseCreate(BaseModel):
    answers: list[AnswerPayload]
    result_title: str | None = None


class TestEventCreate(BaseModel):
    event_type: str
    question_index: int | None = None


class LeadUpdate(BaseModel):
    lead_name: str | None = None
    lead_phone: str | None = None
    lead_email: str | None = None
    lead_site: str | None = None
    lead_form_submitted: bool | None = None
    lead_site_clicked: bool | None = None
