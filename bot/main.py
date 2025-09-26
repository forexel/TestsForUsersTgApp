import asyncio

from telegram.ext import ApplicationBuilder, CommandHandler

from bot.config import get_settings
from bot.handlers.admin import admin_command
from bot.handlers.tests import register_handlers, start_command


async def run_bot() -> None:
    settings = get_settings()
    if not settings.bot_token:
        raise RuntimeError("BOT_BOT_TOKEN is required to run the bot")

    application = ApplicationBuilder().token(settings.bot_token).build()
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("admin", admin_command))
    register_handlers(application)

    await application.initialize()
    await application.start()
    await application.updater.start_polling()
    try:
        await application.updater.idle()
    finally:
        await application.stop()
        await application.shutdown()


def main() -> None:
    asyncio.run(run_bot())


if __name__ == "__main__":
    main()
