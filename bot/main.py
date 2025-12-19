import asyncio
import logging
logging.basicConfig(level=logging.INFO)

from telegram.ext import ApplicationBuilder, CommandHandler

from bot.config import get_settings
from bot.handlers.admin import admin_command
from bot.handlers.publish import publish_command
from bot.handlers.tests import register_handlers, start_command


def main() -> None:
    settings = get_settings()
    logging.info(f"Loaded bot settings: token_prefix={settings.bot_token[:10]}..., admin_ids={getattr(settings, 'admin_ids', [])}")
    if not settings.bot_token:
        raise RuntimeError("BOT_BOT_TOKEN is required to run the bot")

    application = ApplicationBuilder().token(settings.bot_token).build()
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("admin", admin_command))
    application.add_handler(CommandHandler("publish", publish_command))
    register_handlers(application)

    # Recommended entry point for PTB v20/21: blocks and manages lifecycle internally
    application.run_polling()


if __name__ == "__main__":
    main()
