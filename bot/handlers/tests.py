from __future__ import annotations

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import CallbackQueryHandler, ContextTypes

from bot.services.api_client import ApiClient
from bot.services.session_store import session_store

SUPPORTED_TYPES = {"single"}


def register_handlers(application):
    application.add_handler(CallbackQueryHandler(handle_answer, pattern=r"^ans:"))


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    if not message:
        return

    slug = None
    if context.args:
        argument = context.args[0]
        if argument.startswith("run_"):
            slug = argument.removeprefix("run_")

    if not slug:
        await message.reply_text("Привет! Отправьте ссылку вида t.me/<bot>?start=run_<slug> чтобы пройти тест.")
        return

    client = ApiClient()
    try:
        test = await client.get_public_test(slug)
    finally:
        await client.aclose()

    if not test:
        await message.reply_text("Тест не найден или недоступен.")
        return

    test_type = test.get("type")
    if test_type not in SUPPORTED_TYPES:
        await message.reply_text("Пока что бот поддерживает только тесты с одним вопросом.")
        return

    user = update.effective_user
    if not user:
        await message.reply_text("Не удалось определить пользователя.")
        return

    session = session_store.start_session(user_id=user.id, chat_id=message.chat_id, slug=slug, test=test)
    await send_single_question(message, session)


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

    if answer.get("is_correct") is True:
        return "Верно! Поздравляем."
    if answer.get("is_correct") is False:
        return "Неверно. Попробуйте другой тест."

    if answer.get("text"):
        return f"Вы выбрали: {answer['text']}"
    return "Спасибо за участие в тесте!"
