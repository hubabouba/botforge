import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  type Message,
  type ButtonInteraction,
} from "discord.js";
import type { BotGraph, ButtonDef } from "@/lib/schema/types";
import { handleUpdate, runNodeById, type RuntimeContext } from "@/lib/runtime/engine";
import { generateReply } from "@/lib/ai/claude";
import type { RunningBot, SessionStore } from "@/lib/runtime/runner";

/**
 * Boot a Discord bot from a graph. Message content intent must be enabled for
 * the application in the Discord developer portal. Button taps carry the target
 * node id in the component customId.
 */
export function createDiscordBot(
  token: string,
  getGraph: () => BotGraph,
  sessions: SessionStore,
  onLog: (level: "info" | "error", message: string) => void,
): RunningBot {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
  });

  const buildCtx = (
    reply: (content: string, components?: ActionRowBuilder<ButtonBuilder>[]) => Promise<void>,
    userId: string,
    userName: string,
    text: string,
    command?: string,
  ): RuntimeContext => ({
    messageText: text,
    command,
    user: { id: userId, name: userName },
    vars: sessions.get(userId),
    async sendText(t) {
      await reply(t || "​");
    },
    async sendButtons(t, buttons: ButtonDef[]) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      buttons.slice(0, 5).forEach((b) => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`n:${b.next ?? ""}`)
            .setLabel(b.label.slice(0, 80))
            .setStyle(ButtonStyle.Primary),
        );
      });
      await reply(t || "​", [row]);
    },
    aiReply: (system, user) => generateReply(system, user),
  });

  client.on(Events.MessageCreate, async (msg: Message) => {
    if (msg.author.bot) return;
    try {
      const text = msg.content ?? "";
      const command = text.startsWith("!") || text.startsWith("/") ? text.slice(1).split(/\s+/)[0] : undefined;
      const ctx = buildCtx(
        async (content, components) => {
          await msg.reply({ content, components: components ?? [] });
        },
        msg.author.id,
        msg.author.username,
        text,
        command,
      );
      await handleUpdate(getGraph(), ctx);
    } catch (e) {
      onLog("error", `discord message error: ${(e as Error).message}`);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    const btn = interaction as ButtonInteraction;
    try {
      await btn.deferUpdate();
      const targetId = btn.customId.startsWith("n:") ? btn.customId.slice(2) : "";
      if (!targetId) return;
      const ctx = buildCtx(
        async (content, components) => {
          await btn.followUp({ content, components: components ?? [], ephemeral: false });
        },
        btn.user.id,
        btn.user.username,
        "",
      );
      await runNodeById(getGraph(), targetId, ctx);
    } catch (e) {
      onLog("error", `discord interaction error: ${(e as Error).message}`);
    }
  });

  return {
    async start() {
      client.once(Events.ClientReady, (c) => onLog("info", `Discord bot ready as ${c.user.tag}.`));
      await client.login(token);
    },
    async stop() {
      await client.destroy();
      onLog("info", "Discord bot stopped.");
    },
  };
}
