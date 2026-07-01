import { prisma } from "@/db/prisma";
import { decryptToken } from "@/lib/crypto";
import { parseGraph, type BotGraph } from "@/lib/schema/types";
import { createTelegramBot } from "@/lib/runtime/telegram";
import { createDiscordBot } from "@/lib/runtime/discord";

/** A running bot instance the runner can start/stop. */
export interface RunningBot {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Per-user session variable storage for a single running bot. */
export interface SessionStore {
  get(userId: string): Record<string, string>;
}

function createSessionStore(): SessionStore {
  const map = new Map<string, Record<string, string>>();
  return {
    get(userId) {
      let s = map.get(userId);
      if (!s) {
        s = {};
        map.set(userId, s);
      }
      return s;
    },
  };
}

interface Entry {
  instance: RunningBot;
  graphHolder: { graph: BotGraph };
}

// Persist the registry across Next.js dev hot-reloads.
const globalForRunner = globalThis as unknown as {
  __botRegistry?: Map<string, Entry>;
};
const registry: Map<string, Entry> =
  globalForRunner.__botRegistry ?? (globalForRunner.__botRegistry = new Map());

async function log(botId: string, level: "info" | "error", message: string) {
  try {
    await prisma.botLog.create({ data: { botId, level, message } });
  } catch {
    // Logging must never crash the runtime.
  }
}

export function isRunning(botId: string): boolean {
  return registry.has(botId);
}

/** Start a bot by id: load config, decrypt token, boot the right adapter. */
export async function startBot(botId: string): Promise<void> {
  if (registry.has(botId)) return; // already running

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot) throw new Error("Bot not found.");
  if (!bot.tokenEnc) throw new Error("Bot has no token — add one before starting.");

  const token = decryptToken(bot.tokenEnc);
  const graphHolder = { graph: parseGraph(bot.graph) };
  const sessions = createSessionStore();
  const onLog = (level: "info" | "error", message: string) => void log(botId, level, message);
  const getGraph = () => graphHolder.graph;

  const instance =
    bot.platform === "discord"
      ? createDiscordBot(token, getGraph, sessions, onLog)
      : createTelegramBot(token, getGraph, sessions, onLog);

  try {
    await instance.start();
    registry.set(botId, { instance, graphHolder });
    await prisma.bot.update({ where: { id: botId }, data: { status: "running", lastError: null } });
  } catch (e) {
    const msg = (e as Error).message;
    await prisma.bot.update({ where: { id: botId }, data: { status: "error", lastError: msg } });
    await log(botId, "error", `Failed to start: ${msg}`);
    throw e;
  }
}

/** Stop a running bot and update its status. */
export async function stopBot(botId: string): Promise<void> {
  const entry = registry.get(botId);
  if (entry) {
    try {
      await entry.instance.stop();
    } finally {
      registry.delete(botId);
    }
  }
  await prisma.bot.update({ where: { id: botId }, data: { status: "stopped" } }).catch(() => {});
}

/** Push an updated graph to a live bot without restarting it. */
export function updateGraph(botId: string, graph: BotGraph): void {
  const entry = registry.get(botId);
  if (entry) entry.graphHolder.graph = graph;
}
