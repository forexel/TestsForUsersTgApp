from __future__ import annotations
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo
from telegram.ext import CallbackQueryHandler, ContextTypes

from bot.services.api_client import ApiClient
from bot.services.session_store import session_store

import os
import json
import urllib.request
from bot.config import get_settings

SUPPORTED_TYPES = {"single"}


def register_handlers(application):
    application.add_handler(CallbackQueryHandler(handle_answer, pattern=r"^ans:"))


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    if not message:
        return

    # Extract slug from `/start run_<slug>`
    slug = None
    try:
        if context.args:
            arg = context.args[0]
            if isinstance(arg, str) and arg.startswith("run_"):
                slug = arg.removeprefix("run_")
    except Exception:
        slug = None

    # Resolve WebApp base URL
    try:
        settings = get_settings()
        base_url = getattr(settings, "webapp_url", None)
    except Exception:
        base_url = None
    base_url = (base_url or os.getenv("BOT_WEBAPP_URL", "http://localhost:8080")).rstrip("/")

    if slug:
        # Try to get test title from API (public endpoint); fall back to slug
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

        # Preferred: open mini‑app with start param that WebApp parses (Home.tsx → extractStartParam)
        webapp_url = f"{base_url}/?tgWebAppStartParam=run_{slug}
        kb = InlineKeyboardMarkup(
            [[InlineKeyboardButton(text="Открыть тест", web_app=WebAppInfo(url=webapp_url))]]
        )
        await message.reply_text(
            f'тест "{title}" ', reply_markup=kb
        )
        return

    # No slug provided → offer to open app root
    kb = InlineKeyboardMarkup(
        [[InlineKeyboardButton(text="Открыть мини‑приложение", web_app=WebAppInfo(url=f"{base_url}"))]]
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
