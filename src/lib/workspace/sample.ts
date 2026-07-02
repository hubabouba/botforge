/**
 * Seed project for the workspace UI. A realistic, idiomatic Telegram bot in
 * Python so the editor, file tree and chat feel like a real product before the
 * AI backend is wired up. Swapped for AI-generated / DB-loaded projects later.
 */
import type { Project, ChatMessage } from "./types";

const mainPy = `# crypto-alert-bot · entrypoint
import logging
from telegram.ext import ApplicationBuilder, CommandHandler

from bot.config import settings
from bot.handlers import start, price, subscribe, unsubscribe
from bot.jobs import schedule_daily_report

logging.basicConfig(
    format="%(asctime)s · %(levelname)s · %(name)s — %(message)s",
    level=logging.INFO,
)
log = logging.getLogger("crypto-alert-bot")


def main() -> None:
    app = ApplicationBuilder().token(settings.telegram_token).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("price", price))
    app.add_handler(CommandHandler("subscribe", subscribe))
    app.add_handler(CommandHandler("unsubscribe", unsubscribe))

    schedule_daily_report(app)

    log.info("Bot is up — polling for updates")
    app.run_polling(allowed_updates=["message"])


if __name__ == "__main__":
    main()
`;

const handlersPy = `# Command handlers — one function per /command.
from telegram import Update
from telegram.ext import ContextTypes

from bot.services import get_price, format_prices
from bot.database import add_subscriber, remove_subscriber

WELCOME = (
    "👋 Hi! I track crypto prices for you.\\n\\n"
    "/price BTC — current price\\n"
    "/subscribe — daily 9:00 report\\n"
    "/unsubscribe — stop the report"
)


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME)


async def price(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    symbol = (ctx.args[0] if ctx.args else "BTC").upper()
    value = await get_price(symbol)
    if value is None:
        await update.message.reply_text(f"Unknown symbol: {symbol}")
        return
    await update.message.reply_text(f"{symbol}: \${value:,.2f}")


async def subscribe(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    add_subscriber(update.effective_chat.id)
    await update.message.reply_text("✅ Subscribed. I'll message you at 9:00.")


async def unsubscribe(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    remove_subscriber(update.effective_chat.id)
    await update.message.reply_text("You're unsubscribed. Come back anytime!")
`;

const jobsPy = `# Scheduled jobs — the daily price digest.
from datetime import time
from telegram.ext import Application, ContextTypes

from bot.services import format_prices
from bot.database import list_subscribers

WATCHLIST = ["BTC", "ETH", "SOL"]


async def _daily_report(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    body = await format_prices(WATCHLIST)
    for chat_id in list_subscribers():
        await ctx.bot.send_message(chat_id, f"📈 Daily report\\n\\n{body}")


def schedule_daily_report(app: Application) -> None:
    # 09:00 UTC every day.
    app.job_queue.run_daily(_daily_report, time=time(hour=9, minute=0))
`;

const servicesPy = `# External data — price lookups via CoinGecko.
import httpx

_API = "https://api.coingecko.com/api/v3/simple/price"
_IDS = {"BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana"}


async def get_price(symbol: str) -> float | None:
    coin_id = _IDS.get(symbol.upper())
    if not coin_id:
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(_API, params={"ids": coin_id, "vs_currencies": "usd"})
        r.raise_for_status()
        return r.json()[coin_id]["usd"]


async def format_prices(symbols: list[str]) -> str:
    lines = []
    for symbol in symbols:
        value = await get_price(symbol)
        if value is not None:
            lines.append(f"{symbol}: \${value:,.2f}")
    return "\\n".join(lines)
`;

const databasePy = `# Minimal subscriber store. Swap for Postgres in production.
import json
from pathlib import Path

_FILE = Path("subscribers.json")


def _load() -> set[int]:
    if _FILE.exists():
        return set(json.loads(_FILE.read_text()))
    return set()


def _save(ids: set[int]) -> None:
    _FILE.write_text(json.dumps(sorted(ids)))


def add_subscriber(chat_id: int) -> None:
    ids = _load()
    ids.add(chat_id)
    _save(ids)


def remove_subscriber(chat_id: int) -> None:
    ids = _load()
    ids.discard(chat_id)
    _save(ids)


def list_subscribers() -> list[int]:
    return sorted(_load())
`;

const configPy = `# Typed settings loaded from the environment.
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    telegram_token: str


def _load() -> Settings:
    token = os.environ.get("TELEGRAM_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_TOKEN is not set — see .env.example")
    return Settings(telegram_token=token)


settings = _load()
`;

const requirements = `python-telegram-bot[job-queue]==21.6
httpx==0.27.2
`;

const envExample = `# Copy to .env and fill in your token from @BotFather
TELEGRAM_TOKEN=
`;

const readme = `# crypto-alert-bot

A Telegram bot that reports crypto prices and sends a daily 9:00 digest.

## Run locally

\`\`\`bash
pip install -r requirements.txt
cp .env.example .env      # add your TELEGRAM_TOKEN
python main.py
\`\`\`

## Commands

- \`/price BTC\` — current price
- \`/subscribe\` — daily report at 09:00
- \`/unsubscribe\` — stop the report

Generated with Botforge — the code is yours.
`;

export const sampleProject: Project = {
  id: "demo",
  name: "crypto-alert-bot",
  platform: "telegram",
  language: "python",
  description: "Telegram bot: crypto prices + a daily 9:00 digest",
  entry: "main.py",
  files: [
    { path: "main.py", content: mainPy },
    { path: "bot/config.py", content: configPy },
    { path: "bot/handlers.py", content: handlersPy },
    { path: "bot/jobs.py", content: jobsPy },
    { path: "bot/services.py", content: servicesPy },
    { path: "bot/database.py", content: databasePy },
    { path: "requirements.txt", content: requirements },
    { path: ".env.example", content: envExample },
    { path: "README.md", content: readme },
  ],
};

/** Seed conversation that mirrors the "magic moment" from the landing page. */
export const sampleChat: ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    text: "Make a Telegram bot that tells crypto prices and sends a daily report at 9:00.",
  },
  {
    id: "m2",
    role: "assistant",
    text: "Done — here's a clean python-telegram-bot project. It splits handlers, jobs and data access so it's easy to extend.",
    steps: [
      {
        kind: "reasoning",
        text: "I'll use python-telegram-bot with its JobQueue for the daily digest, httpx for CoinGecko lookups, and a small file store for subscribers (swappable for Postgres later).",
      },
      { kind: "file", path: "main.py", action: "create", added: 34 },
      { kind: "file", path: "bot/handlers.py", action: "create", added: 41 },
      { kind: "file", path: "bot/jobs.py", action: "create", added: 22 },
      { kind: "file", path: "bot/services.py", action: "create", added: 28 },
      { kind: "run", ok: true, text: "Bot is up — polling for updates" },
    ],
  },
];
