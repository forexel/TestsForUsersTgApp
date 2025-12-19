from __future__ import annotations
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo
from telegram.ext import CallbackQueryHandler, ContextTypes, MessageHandler, filters
from telegram.error import BadRequest, Forbidden, TelegramError

from bot.services.api_client import ApiClient
from bot.services.session_store import session_store
from bot.services.publish_state import (
    PublishState,
    get_publish_state,
    set_publish_state,
    clear_publish_state,
)

import os
import json
import urllib.request
import re
import html
from bot.config import get_settings

SUPPORTED_TYPES = {"single"}
RUN_SLUG_RE = re.compile(r"(?:run_|run_test-|slug=)([A-Za-z0-9._\-]+)", re.IGNORECASE)


def parse_start_payload(raw: str | None) -> tuple[str | None, int | None]:
    if not raw:
        return None, None
    slug = None
    src_chat_id: int | None = None
    if raw.startswith("run_test-"):
        payload = raw.removeprefix("run_test-")
        if "__src_" in payload:
            parts = payload.split("__src_", 1)
            slug = parts[0]
            try:
                src_chat_id = int(parts[1])
            except (TypeError, ValueError):
                src_chat_id = None
        else:
            slug = payload
    elif raw.startswith("run_"):
        slug = raw.removeprefix("run_")
    return slug, src_chat_id


def register_handlers(application):
    application.add_handler(CallbackQueryHandler(handle_answer, pattern=r"^ans:"))
    application.add_handler(CallbackQueryHandler(publish_test_callback, pattern=r"^publish_test:"))
    application.add_handler(CallbackQueryHandler(publish_skip_photo_callback, pattern=r"^publish_skip_photo$"))
    application.add_handler(CallbackQueryHandler(publish_skip_short_text_callback, pattern=r"^publish_skip_short_text$"))
    application.add_handler(CallbackQueryHandler(publish_skip_title_callback, pattern=r"^publish_skip_title$"))
    application.add_handler(MessageHandler(filters.PHOTO, publish_photo_router))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, publish_text_router))
    application.add_handler(MessageHandler((filters.ALL & ~filters.COMMAND), detect_test_links))


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    if not message:
        return

    # Extract slug from `/start run_<slug>` or `/start run_test-<slug>__src_<chat_id>`
    slug = None
    src_chat_id = None
    try:
        if context.args:
            arg = context.args[0]
            if isinstance(arg, str) and arg.startswith("run_test-"):
                slug, src_chat_id = parse_start_payload(arg)
            elif isinstance(arg, str) and arg.startswith("run_"):
                slug = arg.removeprefix("run_")
    except Exception:
        slug = None

    if slug:
        await reply_with_test_button(message, slug, src_chat_id=src_chat_id)
        return

    # No slug provided → offer to open app root
    kb = InlineKeyboardMarkup(
        [[InlineKeyboardButton(text="Открыть мини‑приложение", web_app=WebAppInfo(url=f"{get_webapp_base_url()}"))]]
    )
    await message.reply_text(
        "Привет! Отправьте ссылку вида t.me/<bot>?start=run_<slug> чтобы пройти тест,\nили откройте мини‑приложение:",
        reply_markup=kb,
    )
    return


async def send_single_question(message, session):
    questions = session.test.get("questions", [])
    if not questions:
        await message.reply_text("Тест некорректно настроен (нет вопросов).")
        session_store.clear_session(session.session_id)
        return

    question = questions[session.current_question]
    answers = question.get("answers", [])
    if not answers:
        await message.reply_text("Вопрос не содержит ответов. Свяжитесь с администратором.")
        session_store.clear_session(session.session_id)
        return

    keyboard = [
        [
            InlineKeyboardButton(
                text=answer.get("text", f"Ответ {idx + 1}"),
                callback_data=f"ans:{session.session_id}:{idx}"
            )
        ]
        for idx, answer in enumerate(answers)
    ]

    await message.reply_text(
        f"{question.get('text', 'Вопрос')}\n\nВыберите ответ:",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def handle_answer(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    callback = update.callback_query
    if not callback:
        return
    await callback.answer()

    data = callback.data or ""
    try:
        _, session_id, answer_index = data.split(":", 2)
    except ValueError:
        return

    session = session_store.get(session_id)
    if not session:
        await callback.edit_message_text("Сессия не найдена или устарела.")
        return

    questions = session.test.get("questions", [])
    if session.current_question >= len(questions):
        await callback.edit_message_text("Сессия устарела. Начните тест заново.")
        session_store.clear_session(session_id)
        return

    question = questions[session.current_question]
    answers = question.get("answers", [])
    try:
        answer = answers[int(answer_index)]
    except (ValueError, IndexError):
        answer = None

    if not answer:
        await callback.edit_message_text("Ответ не найден. Попробуйте начать тест заново.")
        session_store.clear_session(session_id)
        return

    result_text = build_result_text(answer, session.test)
    session_store.clear_session(session_id)

    await callback.edit_message_text(result_text)


def build_result_text(answer, test):
    results = {str(res.get("id")): res for res in test.get("results", [])}
    result_id = answer.get("result_id")
    if result_id:
        result = results.get(str(result_id))
        if result:
            title = result.get("title", "Результат")
            description = result.get("description", "")
            return f"{title}\n\n{description}".strip()

    # fallback to per-answer explanation if provided
    if answer.get("explanation_title") or answer.get("explanation_text"):
        title = answer.get("explanation_title") or "Результат"
        description = answer.get("explanation_text") or ""
        return f"{title}\n\n{description}".strip()

    if answer.get("is_correct") is True:
        return "Верно! Поздравляем."
    if answer.get("is_correct") is False:
        return "Неверно. Попробуйте другой тест."

    if answer.get("text"):
        return f"Вы выбрали: {answer['text']}"
    return "Спасибо за участие в тесте!"


async def detect_test_links(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    if not message:
        return
    chat = message.chat
    if chat and chat.type not in {"group", "supergroup"}:
        return
    if message.from_user and message.from_user.is_bot:
        return
    slug = extract_slug_from_message(message)
    if not slug:
        return
    await reply_with_test_button(message, slug)


async def reply_with_test_button(message, slug: str, src_chat_id: int | None = None) -> None:
    base_url = get_webapp_base_url()
    title = await fetch_test_title(slug)
    if src_chat_id is not None:
        start_param = f"run_test-{slug}__src_{src_chat_id}"
    else:
        start_param = f"run_{slug}"
    webapp_url = f"{base_url}/?tgWebAppStartParam={start_param}"
    kb = InlineKeyboardMarkup(
        [[InlineKeyboardButton(text="Открыть тест", web_app=WebAppInfo(url=webapp_url))]]
    )
    await message.reply_text(
        f'тест "{title}" ', reply_markup=kb
    )


async def fetch_test_title(slug: str) -> str:
    title = slug
    try:
        api_base = os.getenv("BOT_API_BASE_URL") or getattr(get_settings(), "api_base_url", "")
        api_base = str(api_base).rstrip("/")
        url = f"{api_base}/tests/slug/{slug}/public"
        with urllib.request.urlopen(url, timeout=5) as resp:
            if resp.status == 200 and "application/json" in (resp.headers.get("Content-Type") or ""):
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, dict) and data.get("title"):
                    title = str(data["title"])
    except Exception:
        pass
    return title


def get_webapp_base_url() -> str:
    try:
        settings = get_settings()
        base_url = getattr(settings, "webapp_url", None)
    except Exception:
        base_url = None
    return (base_url or os.getenv("BOT_WEBAPP_URL", "http://localhost:8080")).rstrip("/")


def extract_slug_from_message(message) -> str | None:
    candidates: list[str] = []
    if message.text:
        candidates.append(message.text)
    if message.caption:
        candidates.append(message.caption)

    def collect_entities(entities):
        if not entities:
            return
        for entity in entities:
            if entity.type not in {"url", "text_link"}:
                continue
            try:
                candidates.append(message.parse_entity(entity))
            except Exception:
                continue

    collect_entities(getattr(message, "entities", None))
    collect_entities(getattr(message, "caption_entities", None))

    for text in candidates:
        if not text:
            continue
        match = RUN_SLUG_RE.search(text)
        if match and match.group(1):
            return match.group(1)
    return None


async def publish_test_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    if message:
        await message.reply_text("Публикация через кнопку сейчас не активна. Используйте команду: /publish <slug> <chat> [текст].")


async def publish_skip_photo_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await publish_test_callback(update, context)


async def publish_skip_short_text_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await publish_test_callback(update, context)


async def publish_skip_title_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await publish_test_callback(update, context)


async def publish_photo_router(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    return


async def publish_text_router(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    return
