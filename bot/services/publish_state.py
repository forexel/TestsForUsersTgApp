from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class PublishState:
    user_id: int
    test_slug: str
    test_title: str
    step: str = "photo"
    photo_file_id: Optional[str] = None
    short_text: Optional[str] = None
    title_override: Optional[str] = None
    channel_username: Optional[str] = None
    message_id: Optional[int] = field(default=None)


_states: Dict[int, PublishState] = {}


def set_publish_state(state: PublishState) -> None:
    _states[state.user_id] = state


def get_publish_state(user_id: int) -> PublishState | None:
    return _states.get(user_id)


def clear_publish_state(user_id: int) -> None:
    _states.pop(user_id, None)
