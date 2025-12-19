from __future__ import annotations

from typing import Tuple

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo
from telegram.ext import ContextTypes

from bot.config import get_settings
from bot.services.api_client import ApiClient


def parse_chat_target(raw: str) -> Tuple[str | int, int | None]:
    raw = raw.strip()
    if raw.startswith("http://") or raw.startswith("https://"):
        tail = raw.split("t.me/", 1)[-1]
        tail = tail.split("/", 1)[0].strip()
        if tail:
            raw = f"@{tail}" if not tail.startswith("@") else tail
    if raw.startswith("@"):
        return raw, None
    if raw.lstrip("-").isdigit():
        val = int(raw)
        return val, val
    return raw, None


async def publish_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    if not message:
        return

    if not context.args or len(context.args) < 2:
        await message.reply_text("Формат: /publish <slug> <chat> [текст]")
        return

    slug = context.args[0].strip()
    chat_raw = context.args[1].strip()
    caption_override = " ".join(context.args[2:]).strip() if len(context.args) > 2 else ""

    settings = get_settings()
    bot_username = settings.bot_username
    if not bot_username:
        try:
            me = await context.bot.get_me()
            bot_username = me.username
        except Exception:
            bot_username = None
    if not bot_username:
        await message.reply_text("BOT_USERNAME не задан. Укажите BOT_USERNAME в переменных окружения.")
        return

    target_chat, src_chat_id = parse_chat_target(chat_raw)
    if isinstance(target_chat, str) and target_chat.startswith("@") and src_chat_id is None:
        try:
            chat_info = await context.bot.get_chat(target_chat)
            src_chat_id = int(chat_info.id)
        except Exception:
            src_chat_id = None

    start_param = f"run_test-{slug}"
    if src_chat_id is not None:
        start_param = f"{start_param}__src_{src_chat_id}"
    webapp_url = f"{settings.webapp_url.rstrip('/')}/?tgWebAppStartParam={start_param}"

    title = slug
    api = ApiClient()
    try:
        data = await api.get_public_test(slug)
        if data and data.get("title"):
            title = str(data["title"])
    except Exception:
        pass
    finally:
        try:
            await api.aclose()
        except Exception:
            pass

    caption = caption_override or f"Тест: {title}"
    photo = settings.default_publish_photo_file_id
    markup = InlineKeyboardMarkup([[InlineKeyboardButton("Пройти тест", web_app=WebAppInfo(url=webapp_url))]])

    if photo:
        await context.bot.send_photo(
            chat_id=target_chat,
            photo=photo,
            caption=caption.strip(),
            reply_markup=markup,
        )
    else:
        await context.bot.send_message(
            chat_id=target_chat,
            text=caption.strip(),
            reply_markup=markup,
        )

    await message.reply_text("Пост опубликован.")
