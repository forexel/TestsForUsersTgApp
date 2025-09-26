from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo
from telegram.ext import ContextTypes

from bot.config import get_settings


async def admin_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    settings = get_settings()
    user = update.effective_user
    message = update.effective_message

    if user is None or message is None:
        return

    if user.id not in settings.admin_ids:
        await message.reply_text("У вас нет доступа к админке.")
        return

    web_app_info = WebAppInfo(url=str(settings.webapp_url))
    keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton(text="Открыть конструктор", web_app=web_app_info)]]
    )
    await message.reply_text("Откройте конструктор тестов:", reply_markup=keyboard)
