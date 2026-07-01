import { Bot, InlineKeyboard } from "grammy";
import type { BotGraph, ButtonDef } from "@/lib/schema/types";
import { handleUpdate, runNodeById, type RuntimeContext } from "@/lib/runtime/engine";
import { generateReply } from "@/lib/ai/claude";
import type { RunningBot, SessionStore } from "@/lib/runtime/runner";

/**
 * Boot a Telegram bot from a graph using grammY long-polling. Button taps carry
 * the target node id in callback_data so the engine can resume the flow.
 */
export function createTelegramBot(
  token: string,
  getGraph: () => BotGraph,
  sessions: SessionStore,
  onLog: (level: "info" | "error", message: string) => void,
): RunningBot {
  const bot = new Bot(token);

  const buildCtx = (chatId: number, userId: string, userName: string, text: string, command?: string): RuntimeContext => ({
    messageText: text,
    command,
    user: { id: userId, name: userName },
    vars: sessions.get(userId),
    async sendText(t) {
      await bot.api.sendMessage(chatId, t || " ");
    },
    async sendButtons(t, buttons: ButtonDef[]) {
      const kb = new InlineKeyboard();
      buttons.forEach((b, i) => {
        kb.text(b.label, `n:${b.next ?? ""}`);
        if ((i + 1) % 2 === 0) kb.row();
      });
      await bot.api.sendMessage(chatId, t || " ", { reply_markup: kb });
    },
    aiReply: (system, user) => generateReply(system, user),
  });

  bot.on("message:text", async (upd) => {
    try {
      const text = upd.message.text ?? "";
      const command = text.startsWith("/") ? text.slice(1).split(/\s+/)[0] : undefined;
      const ctx = buildCtx(
        upd.chat.id,
        String(upd.from?.id ?? upd.chat.id),
        upd.from?.first_name ?? "there",
        text,
        command,
      );
      await handleUpdate(getGraph(), ctx);
    } catch (e) {
      onLog("error", `telegram message error: ${(e as Error).message}`);
    }
  });

  bot.on("callback_query:data", async (upd) => {
    try {
      await upd.answerCallbackQuery();
      const data = upd.callbackQuery.data ?? "";
      const targetId = data.startsWith("n:") ? data.slice(2) : "";
      const chatId = upd.callbackQuery.message?.chat.id;
      if (!chatId || !targetId) return;
      const ctx = buildCtx(
        chatId,
        String(upd.from.id),
        upd.from.first_name ?? "there",
        "",
      );
      await runNodeById(getGraph(), targetId, ctx);
    } catch (e) {
      onLog("error", `telegram callback error: ${(e as Error).message}`);
    }
  });

  return {
    async start() {
      // start() resolves only when the bot stops, so we don't await it.
      bot.start({ onStart: () => onLog("info", "Telegram bot started (long polling).") }).catch((e) =>
        onLog("error", `telegram runtime error: ${(e as Error).message}`),
      );
    },
    async stop() {
      await bot.stop();
      onLog("info", "Telegram bot stopped.");
    },
  };
}
