from __future__ import annotations

import uuid
from pydantic import BaseModel


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    token: str
    username: str
    scope: str


class AdminTestListItem(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    created_by_username: str | None = None
    lead_enabled: bool
    lead_collect_name: bool
    lead_collect_phone: bool
    lead_collect_email: bool
    lead_collect_site: bool
    lead_site_url: str | None = None


class AdminQuestion(BaseModel):
    id: str
    text: str
    order_num: int


class AdminFunnelStep(BaseModel):
    question_index: int
    count: int


class AdminTestFunnel(BaseModel):
    screen_opens: int
    answers: list[AdminFunnelStep]
    lead_form_submits: int
    site_clicks: int


class AdminResponseRow(BaseModel):
    user_id: int
    user_username: str | None = None
    result_title: str | None = None
    answers: dict[str, str]
    lead_name: str | None = None
    lead_phone: str | None = None
    lead_email: str | None = None
    lead_site: str | None = None
    lead_form_submitted: bool
    lead_site_clicked: bool


class AdminTestReport(BaseModel):
    test: AdminTestListItem
    questions: list[AdminQuestion]
    funnel: AdminTestFunnel
    responses: list[AdminResponseRow]
