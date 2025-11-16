import time
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo
from telegram.ext import ContextTypes

from bot.config import get_settings


async def admin_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    settings = get_settings()
    user = update.effective_user
    message = update.effective_message

    if user is None or message is None:
        return

    url = str(settings.webapp_url)
    # cache buster to avoid Telegram WebView caching old index.html
    url_with_cb = url + ("&" if "?" in url else "?") + f"v={int(time.time())}"
    if url.startswith("https://"):
        web_app_info = WebAppInfo(url=url_with_cb)
        keyboard = InlineKeyboardMarkup(
            [[InlineKeyboardButton(text="Открыть конструктор", web_app=web_app_info)]]
        )
        await message.reply_text("Откройте конструктор тестов:", reply_markup=keyboard)
    else:
        # Telegram запрещает web_app c http. Для локалки шлём обычную URL‑кнопку.
        keyboard = InlineKeyboardMarkup(
            [[InlineKeyboardButton(text="Открыть конструктор (браузер)", url=url_with_cb)]]
        )
        await message.reply_text(
            "Для локального запуска нужен https для WebApp. Временно открываем в браузере:",
            reply_markup=keyboard,
        )
