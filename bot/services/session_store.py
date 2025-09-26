from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class TestSession:
    session_id: str
    user_id: int
    chat_id: int
    slug: str
    test: Dict[str, Any]
    current_question: int = 0
    answers: list[Dict[str, Any]] = field(default_factory=list)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: Dict[str, TestSession] = {}
        self._by_user: Dict[int, str] = {}

    def start_session(self, *, user_id: int, chat_id: int, slug: str, test: Dict[str, Any]) -> TestSession:
        prev_session_id = self._by_user.get(user_id)
        if prev_session_id:
            self._sessions.pop(prev_session_id, None)

        session_id = uuid.uuid4().hex
        session = TestSession(session_id=session_id, user_id=user_id, chat_id=chat_id, slug=slug, test=test)
        self._sessions[session_id] = session
        self._by_user[user_id] = session_id
        return session

    def get(self, session_id: str) -> Optional[TestSession]:
        return self._sessions.get(session_id)

    def clear_session(self, session_id: str) -> None:
        session = self._sessions.pop(session_id, None)
        if session:
            self._by_user.pop(session.user_id, None)


session_store = SessionStore()
