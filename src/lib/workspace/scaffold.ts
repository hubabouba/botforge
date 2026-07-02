/**
 * Deterministic project scaffolder — the stand-in for the AI generator.
 *
 * The create wizard collects intent (type, platform, language, audience, what it
 * should do). This turns those answers into a real, runnable starter: type-shaped
 * handler code for the chosen runtime plus a personalized README and env file.
 * When Claude is wired up it replaces this module; the wizard stays the same.
 */
import type { Language, Platform, ProjectFile } from "./types";
import type { ProjectSpec } from "./store";

export type BotType = "assistant" | "notifications" | "moderation" | "commerce" | "utility" | "blank";
export type Audience = "personal" | "team" | "business";

export interface CreateAnswers {
  name: string;
  platform: Platform;
  language: Language;
  type: BotType;
  audience: Audience;
  purpose: string;
}

export interface BotTypeMeta {
  id: BotType;
  label: string;
  blurb: string;
  icon: "assistant" | "bell" | "shield" | "bag" | "wrench" | "bot";
  platform: Platform;
  language: Language;
  commands: string[];
}

export const BOT_TYPES: BotTypeMeta[] = [
  {
    id: "assistant",
    label: "Assistant / FAQ",
    blurb: "Answers questions and greets users with a small knowledge base.",
    icon: "assistant",
    platform: "telegram",
    language: "python",
    commands: ["/start", "/help", "keyword replies"],
  },
  {
    id: "notifications",
    label: "Notifications",
    blurb: "Sends scheduled updates and alerts to subscribers.",
    icon: "bell",
    platform: "telegram",
    language: "python",
    commands: ["/start", "/subscribe", "daily job"],
  },
  {
    id: "moderation",
    label: "Moderation",
    blurb: "Keeps a community tidy — warn, mute, clear messages.",
    icon: "shield",
    platform: "discord",
    language: "node",
    commands: ["!clear", "!kick", "!warn"],
  },
  {
    id: "commerce",
    label: "Shop / Orders",
    blurb: "Lists products and takes simple orders from a chat.",
    icon: "bag",
    platform: "telegram",
    language: "python",
    commands: ["/products", "/order"],
  },
  {
    id: "utility",
    label: "Utility / Tools",
    blurb: "Handy commands — time, echo, small helpers.",
    icon: "wrench",
    platform: "telegram",
    language: "python",
    commands: ["/time", "/echo"],
  },
  {
    id: "blank",
    label: "Blank",
    blurb: "A minimal /start bot — build it your way.",
    icon: "bot",
    platform: "telegram",
    language: "python",
    commands: ["/start"],
  },
];

export const AUDIENCES: { id: Audience; label: string; note: string }[] = [
  { id: "personal", label: "Personal", note: "A bot for yourself or a hobby project." },
  { id: "team", label: "Community", note: "A bot for a group, server, or community." },
  { id: "business", label: "Business", note: "A production bot for a company or product." },
];

export function typeMeta(type: BotType): BotTypeMeta {
  return BOT_TYPES.find((t) => t.id === type) ?? BOT_TYPES[BOT_TYPES.length - 1];
}

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "my-bot";

// ---- Telegram · Python (python-telegram-bot) ----
function pyTelegram(type: BotType, name: string): { entry: string; files: ProjectFile[] } {
  const header = `import logging
import os

from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, ContextTypes, filters

logging.basicConfig(level=logging.INFO)
`;

  let body: string;
  let register: string;
  let needsJobQueue = false;

  switch (type) {
    case "assistant":
      body = `
FAQ = {
    "price": "See our pricing on the website.",
    "hours": "We're open Mon-Fri, 9:00-18:00.",
    "contact": "Reach a human at hello@example.com.",
}


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Hi! Ask me a question, or type /help.")


async def help_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("I can help with: " + ", ".join(FAQ))


async def answer(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    text = (update.message.text or "").lower()
    for key, reply in FAQ.items():
        if key in text:
            await update.message.reply_text(reply)
            return
    await update.message.reply_text("I'm not sure yet — try /help.")
`;
      register = `    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, answer))`;
      break;

    case "notifications":
      needsJobQueue = true;
      body = `
from datetime import time


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Hi! Use /subscribe to get a daily update at 9:00.")


async def subscribe(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    ctx.job_queue.run_daily(_notify, time=time(hour=9), chat_id=chat_id, name=str(chat_id))
    await update.message.reply_text("Subscribed — I'll message you at 9:00 daily.")


async def _notify(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await ctx.bot.send_message(ctx.job.chat_id, "Here's your daily update.")
`;
      register = `    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("subscribe", subscribe))`;
      break;

    case "commerce":
      body = `
PRODUCTS = {
    "1": ("Sticker pack", 3),
    "2": ("T-shirt", 20),
    "3": ("Mug", 12),
}


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Welcome to the shop! Use /products to browse.")


async def products(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    lines = [f"{pid}. {item} — \${price}" for pid, (item, price) in PRODUCTS.items()]
    await update.message.reply_text("\\n".join(lines) + "\\n\\nOrder with /order <id>")


async def order(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    pid = ctx.args[0] if ctx.args else ""
    item = PRODUCTS.get(pid)
    if not item:
        await update.message.reply_text("Unknown item — see /products.")
        return
    await update.message.reply_text(f"Order placed: {item[0]} for \${item[1]}. Thank you!")
`;
      register = `    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("products", products))
    app.add_handler(CommandHandler("order", order))`;
      break;

    case "moderation":
      body = `
async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Moderation bot ready. Reply to a message with /warn or /mute.")


async def warn(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    target = update.message.reply_to_message
    if not target:
        await update.message.reply_text("Reply to a message to warn its author.")
        return
    await update.message.reply_text(f"Warned {target.from_user.first_name}.")


async def mute(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    target = update.message.reply_to_message
    if not target:
        await update.message.reply_text("Reply to a message to mute its author.")
        return
    await ctx.bot.restrict_chat_member(
        update.effective_chat.id,
        target.from_user.id,
        permissions={"can_send_messages": False},
    )
    await update.message.reply_text("User muted.")
`;
      register = `    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("warn", warn))
    app.add_handler(CommandHandler("mute", mute))`;
      break;

    case "utility":
      body = `
from datetime import datetime


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Utility bot. Try /time or /echo <text>.")


async def now(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Server time: " + datetime.utcnow().strftime("%H:%M UTC"))


async def echo(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(" ".join(ctx.args) or "Usage: /echo <text>")
`;
      register = `    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("time", now))
    app.add_handler(CommandHandler("echo", echo))`;
      break;

    default: // blank
      body = `
async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Hello! I'm ${name}.")
`;
      register = `    app.add_handler(CommandHandler("start", start))`;
  }

  const footer = `

def main() -> None:
    app = ApplicationBuilder().token(os.environ["TELEGRAM_TOKEN"]).build()
${register}
    app.run_polling()


if __name__ == "__main__":
    main()
`;

  const requirements = needsJobQueue
    ? "python-telegram-bot[job-queue]==21.6\n"
    : "python-telegram-bot==21.6\n";

  return {
    entry: "main.py",
    files: [
      { path: "main.py", content: header + body + footer },
      { path: "requirements.txt", content: requirements },
    ],
  };
}

// ---- Telegram · Node (grammY) ----
function nodeTelegram(type: BotType, name: string): { entry: string; files: ProjectFile[] } {
  const header = `const { Bot } = require("grammy");

const bot = new Bot(process.env.TELEGRAM_TOKEN);
`;
  let body: string;

  switch (type) {
    case "assistant":
      body = `
const FAQ = {
  price: "See our pricing on the website.",
  hours: "We're open Mon-Fri, 9:00-18:00.",
  contact: "Reach a human at hello@example.com.",
};

bot.command("start", (ctx) => ctx.reply("Hi! Ask me a question, or type /help."));
bot.command("help", (ctx) => ctx.reply("I can help with: " + Object.keys(FAQ).join(", ")));
bot.on("message:text", (ctx) => {
  const text = ctx.message.text.toLowerCase();
  const hit = Object.keys(FAQ).find((k) => text.includes(k));
  ctx.reply(hit ? FAQ[hit] : "I'm not sure yet — try /help.");
});
`;
      break;
    case "commerce":
      body = `
const PRODUCTS = { "1": ["Sticker pack", 3], "2": ["T-shirt", 20], "3": ["Mug", 12] };

bot.command("start", (ctx) => ctx.reply("Welcome to the shop! Use /products."));
bot.command("products", (ctx) => {
  const lines = Object.entries(PRODUCTS).map(([id, item]) => id + ". " + item[0] + " - $" + item[1]);
  ctx.reply(lines.join("\\n") + "\\n\\nOrder with /order <id>");
});
bot.command("order", (ctx) => {
  const item = PRODUCTS[ctx.match.trim()];
  ctx.reply(item ? "Order placed: " + item[0] : "Unknown item — see /products.");
});
`;
      break;
    case "utility":
      body = `
bot.command("start", (ctx) => ctx.reply("Utility bot. Try /time or /echo <text>."));
bot.command("time", (ctx) => ctx.reply("Server time: " + new Date().toISOString()));
bot.command("echo", (ctx) => ctx.reply(ctx.match || "Usage: /echo <text>"));
`;
      break;
    case "notifications":
      body = `
bot.command("start", (ctx) => ctx.reply("Hi! Use /subscribe for updates."));
bot.command("subscribe", (ctx) =>
  ctx.reply("Subscribed. Wire a scheduler (e.g. node-cron) to send daily messages."),
);
`;
      break;
    case "moderation":
      body = `
bot.command("start", (ctx) => ctx.reply("Moderation bot ready. Reply with /warn."));
bot.command("warn", (ctx) => {
  const target = ctx.message.reply_to_message;
  if (!target) return ctx.reply("Reply to a message to warn its author.");
  ctx.reply("Warned " + (target.from.first_name || "user") + ".");
});
`;
      break;
    default:
      body = `
bot.command("start", (ctx) => ctx.reply("Hello! I'm ${name}."));
`;
  }

  const footer = `
bot.start();
console.log("Bot started");
`;

  return {
    entry: "index.js",
    files: [
      { path: "index.js", content: header + body + footer },
      { path: "package.json", content: nodePkg(name, "grammy", "^1.32.0") },
    ],
  };
}

// ---- Discord · Node (discord.js) ----
function nodeDiscord(type: BotType, name: string): { entry: string; files: ProjectFile[] } {
  const header = `const { Client, GatewayIntentBits, Partials } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

client.once("ready", () => console.log("Logged in as " + client.user.tag));
`;
  let body: string;

  switch (type) {
    case "moderation":
      body = `
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    await message.reply("Pong!");
  }
  if (message.content.startsWith("!clear")) {
    const amount = parseInt(message.content.split(" ")[1], 10) || 5;
    await message.channel.bulkDelete(amount, true);
  }
  if (message.content.startsWith("!kick")) {
    const member = message.mentions.members.first();
    if (member) {
      await member.kick();
      await message.channel.send("Kicked " + member.user.tag);
    }
  }
});
`;
      break;
    case "assistant":
      body = `
const FAQ = {
  price: "See our pricing on the website.",
  hours: "We're open Mon-Fri, 9-18.",
  help: "Ping a moderator for help.",
};

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  const text = message.content.toLowerCase();
  const hit = Object.keys(FAQ).find((k) => text.includes(k));
  if (hit) message.reply(FAQ[hit]);
});
`;
      break;
    case "commerce":
      body = `
const PRODUCTS = { "1": ["Sticker pack", 3], "2": ["T-shirt", 20] };

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  if (message.content === "!products") {
    const lines = Object.entries(PRODUCTS).map(([id, item]) => id + ". " + item[0] + " - $" + item[1]);
    message.reply(lines.join("\\n"));
  }
});
`;
      break;
    case "notifications":
      body = `
client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  if (message.content === "!subscribe") {
    message.reply("Subscribed. Wire node-cron to post scheduled updates.");
  }
});
`;
      break;
    default:
      body = `
client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  if (message.content === "!ping") message.reply("Pong!");
  if (message.content === "!time") message.reply(new Date().toISOString());
});
`;
  }

  const footer = `
client.login(process.env.DISCORD_TOKEN);
`;

  return {
    entry: "index.js",
    files: [
      { path: "index.js", content: header + body + footer },
      { path: "package.json", content: nodePkg(name, "discord.js", "^14.16.3") },
    ],
  };
}

function nodePkg(name: string, dep: string, version: string): string {
  return `{
  "name": "${slugify(name)}",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "${dep}": "${version}"
  }
}
`;
}

function buildReadme(a: CreateAnswers): string {
  const meta = typeMeta(a.type);
  const runSteps =
    a.language === "python"
      ? "1. pip install -r requirements.txt\n2. Copy .env.example to .env and add your token\n3. python main.py"
      : "1. npm install\n2. Copy .env.example to .env and add your token\n3. npm start";
  const tokenFrom = a.platform === "telegram" ? "@BotFather on Telegram" : "the Discord Developer Portal";
  const business =
    a.audience === "business"
      ? "\n## Deployment\nRun it on any host (a small VM or a container). Keep the token in an environment\nvariable, never in the code, and add logging/monitoring before going live.\n"
      : "";

  return `# ${a.name}

${a.purpose.trim() || meta.blurb}

Built for ${a.audience} use · ${a.platform === "telegram" ? "Telegram" : "Discord"} · ${a.language === "python" ? "Python" : "Node.js"}

## Commands
${meta.commands.map((c) => `- ${c}`).join("\n")}

## Run locally
${runSteps}

Get a token from ${tokenFrom} and paste it into .env.
${business}
Generated with Botforge — the code is yours.
`;
}

function envExample(a: CreateAnswers): string {
  const key = a.platform === "telegram" ? "TELEGRAM_TOKEN" : "DISCORD_TOKEN";
  const from = a.platform === "telegram" ? "@BotFather" : "the Discord Developer Portal";
  const log = a.audience === "business" ? "LOG_LEVEL=info\n" : "";
  return `# Copy to .env and add your token from ${from}\n${key}=\n${log}`;
}

/** Turn wizard answers into a ready-to-run project spec. */
export function scaffoldProject(answers: CreateAnswers): ProjectSpec {
  // Discord starters use discord.js (Node); force it for a valid project.
  const language: Language = answers.platform === "discord" ? "node" : answers.language;
  const a = { ...answers, language };

  const core =
    a.platform === "discord"
      ? nodeDiscord(a.type, a.name)
      : a.language === "node"
        ? nodeTelegram(a.type, a.name)
        : pyTelegram(a.type, a.name);

  const files: ProjectFile[] = [
    ...core.files,
    { path: ".env.example", content: envExample(a) },
    { path: "README.md", content: buildReadme(a) },
  ];

  return {
    name: a.name.trim() || "my-bot",
    platform: a.platform,
    language: a.language,
    description: a.purpose.trim() || typeMeta(a.type).blurb,
    entry: core.entry,
    files,
  };
}
