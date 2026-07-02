/**
 * Starter templates — real, runnable bot projects the user can open, edit and
 * download. These replace the "AI describe your bot" flow until the generator is
 * wired up: pick a template, customize the code, ship it.
 */
import type { Language, Platform, ProjectFile } from "./types";
import { sampleProject } from "./sample";

export interface Template {
  slug: string;
  name: string;
  platform: Platform;
  language: Language;
  /** One-line description for the gallery card. */
  description: string;
  /** What the starter includes, shown as small bullets. */
  highlights: string[];
  entry: string;
  files: ProjectFile[];
}

// ---- Telegram · Echo (Python) ----
const echoPyMain = `import logging
import os

from telegram import Update
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

logging.basicConfig(level=logging.INFO)


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Hi! Send me anything and I'll echo it back.")


async def echo(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(update.message.text)


def main() -> None:
    token = os.environ["TELEGRAM_TOKEN"]
    app = ApplicationBuilder().token(token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))
    app.run_polling()


if __name__ == "__main__":
    main()
`;

const echoPyReadme = `# telegram-echo-bot

A minimal Telegram bot that echoes back whatever you send.

## Run locally
1. pip install -r requirements.txt
2. Copy .env.example to .env and paste your token from @BotFather
3. python main.py

The code is yours — edit main.py to change how it replies.
`;

// ---- Telegram · Weather (Python) ----
const weatherPyMain = `import os

from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

from weather import get_weather


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Send /weather <city> for the current forecast.")


async def weather(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    city = " ".join(ctx.args) or "London"
    await update.message.reply_text(await get_weather(city))


def main() -> None:
    app = ApplicationBuilder().token(os.environ["TELEGRAM_TOKEN"]).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("weather", weather))
    app.run_polling()


if __name__ == "__main__":
    main()
`;

const weatherPyService = `import httpx

GEO = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST = "https://api.open-meteo.com/v1/forecast"


async def get_weather(city: str) -> str:
    async with httpx.AsyncClient(timeout=10) as client:
        geo = await client.get(GEO, params={"name": city, "count": 1})
        results = geo.json().get("results")
        if not results:
            return f"City not found: {city}"

        place = results[0]
        forecast = await client.get(
            FORECAST,
            params={
                "latitude": place["latitude"],
                "longitude": place["longitude"],
                "current": "temperature_2m,wind_speed_10m",
            },
        )
        cur = forecast.json()["current"]
        return f"{place['name']}: {cur['temperature_2m']}°C, wind {cur['wind_speed_10m']} km/h"
`;

// ---- Discord · Moderation (Node / discord.js) ----
const discordIndex = `const { Client, GatewayIntentBits, Partials } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

client.once("ready", () => {
  console.log("Logged in as " + client.user.tag);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    await message.reply("Pong!");
    return;
  }

  if (message.content.startsWith("!clear")) {
    const amount = parseInt(message.content.split(" ")[1], 10) || 5;
    await message.channel.bulkDelete(amount, true);
    return;
  }

  if (message.content.startsWith("!kick")) {
    const member = message.mentions.members.first();
    if (!member) {
      await message.reply("Mention a member to kick.");
      return;
    }
    await member.kick();
    await message.channel.send("Kicked " + member.user.tag);
  }
});

client.login(process.env.DISCORD_TOKEN);
`;

const discordPkg = `{
  "name": "discord-mod-bot",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "discord.js": "^14.16.3"
  }
}
`;

const discordReadme = `# discord-mod-bot

A small Discord moderation bot: !ping, !clear <n>, !kick @user.

## Run locally
1. npm install
2. Copy .env.example to .env and paste your bot token
3. npm start

Enable the "Message Content" and "Server Members" intents in the Discord Developer Portal.
`;

// ---- Telegram · Echo (Node / grammY) ----
const nodeIndex = `const { Bot } = require("grammy");

const bot = new Bot(process.env.TELEGRAM_TOKEN);

bot.command("start", (ctx) => ctx.reply("Hi! I echo everything you say."));
bot.on("message:text", (ctx) => ctx.reply(ctx.message.text));

bot.start();
console.log("Bot started");
`;

const nodePkg = `{
  "name": "telegram-echo-node",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "grammy": "^1.32.0"
  }
}
`;

const nodeReadme = `# telegram-echo-node

A minimal Telegram bot in Node.js using grammY.

## Run locally
1. npm install
2. Copy .env.example to .env and paste your token from @BotFather
3. npm start
`;

const pyRequirements = (extra = "") => `python-telegram-bot==21.6\n${extra}`;
const tgEnv = `# Copy to .env and add your token from @BotFather\nTELEGRAM_TOKEN=\n`;
const dcEnv = `# Copy to .env and add your bot token from the Discord Developer Portal\nDISCORD_TOKEN=\n`;

export const templates: Template[] = [
  {
    slug: "tg-echo-py",
    name: "telegram-echo-bot",
    platform: "telegram",
    language: "python",
    description: "The simplest starting point — replies with whatever you send.",
    highlights: ["/start command", "Echoes any message", "~30 lines"],
    entry: "main.py",
    files: [
      { path: "main.py", content: echoPyMain },
      { path: "requirements.txt", content: pyRequirements() },
      { path: ".env.example", content: tgEnv },
      { path: "README.md", content: echoPyReadme },
    ],
  },
  {
    slug: "tg-crypto-py",
    name: sampleProject.name,
    platform: "telegram",
    language: "python",
    description: sampleProject.description,
    highlights: ["Price commands", "Daily 9:00 digest", "Clean module split"],
    entry: sampleProject.entry,
    files: sampleProject.files,
  },
  {
    slug: "tg-weather-py",
    name: "weather-bot",
    platform: "telegram",
    language: "python",
    description: "Current weather for any city via the free Open-Meteo API.",
    highlights: ["/weather <city>", "No API key needed", "httpx async"],
    entry: "main.py",
    files: [
      { path: "main.py", content: weatherPyMain },
      { path: "weather.py", content: weatherPyService },
      { path: "requirements.txt", content: pyRequirements("httpx==0.27.2\n") },
      { path: ".env.example", content: tgEnv },
    ],
  },
  {
    slug: "dc-mod-node",
    name: "discord-mod-bot",
    platform: "discord",
    language: "node",
    description: "Discord moderation starter: clear messages, kick, ping.",
    highlights: ["!clear / !kick", "discord.js v14", "Ready to extend"],
    entry: "index.js",
    files: [
      { path: "index.js", content: discordIndex },
      { path: "package.json", content: discordPkg },
      { path: ".env.example", content: dcEnv },
      { path: "README.md", content: discordReadme },
    ],
  },
  {
    slug: "tg-echo-node",
    name: "telegram-echo-node",
    platform: "telegram",
    language: "node",
    description: "A Node.js echo bot built with grammY — great JS starting point.",
    highlights: ["grammY", "TypeScript-friendly", "~10 lines"],
    entry: "index.js",
    files: [
      { path: "index.js", content: nodeIndex },
      { path: "package.json", content: nodePkg },
      { path: ".env.example", content: tgEnv },
      { path: "README.md", content: nodeReadme },
    ],
  },
];

/** A truly empty project for "start from scratch". */
export const blankTemplate: Template = {
  slug: "blank",
  name: "my-bot",
  platform: "telegram",
  language: "python",
  description: "An empty project — start from a blank file.",
  highlights: ["Nothing but main.py", "Full control"],
  entry: "main.py",
  files: [{ path: "main.py", content: "# Your bot starts here\n" }],
};

export function templateBySlug(slug: string): Template | undefined {
  if (slug === "blank") return blankTemplate;
  return templates.find((t) => t.slug === slug);
}
