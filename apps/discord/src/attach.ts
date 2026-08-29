import { loadDiscordConfig } from "./config";
import { handleDiscordInbound, type DiscordDm, type DiscordSay } from "./bridge";
import type { DiscordInbound } from "./map";
import { mapInbound } from "./map";
import { executeDiscordWebhook } from "./webhook";
import { askCardPayload, decideAskClick } from "./ask";
import type { DiscordConnect } from "./live";
import { createDiscordQueue, type DiscordQueue } from "./queue";

export type { DiscordConnect };

export async function attachDiscord(input: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  say: DiscordSay;
  dm?: DiscordDm;
  botName: (botId: string) => string;
  connect?: DiscordConnect;
  fetchFn?: typeof fetch;
  queue?: DiscordQueue;
  onAskDecision?: (decision: "allow" | "deny" | "always") => void;
}): Promise<{ started: boolean; reason?: string }> {
  const cfg = loadDiscordConfig(input.cwd);
  if (!cfg) return { started: false, reason: "no discord.json" };
  const env = input.env ?? process.env;
  const token = String(env[cfg.tokenEnv] ?? "").trim();
  if (!token) return { started: false, reason: `missing ${cfg.tokenEnv}` };
  const fetchFn = input.fetchFn ?? fetch;
  const queue =
    input.queue ??
    createDiscordQueue({
      onDrop: (dest) => {
        console.warn(`discord outbound dropped after rate limits: ${dest}`);
      },
    });
  let pendingAuthor = "";
  const onMessage = async (msg: DiscordInbound) => {
    const mapped = mapInbound(cfg, msg);
    const hook = mapped.crewChannelId ? cfg.webhooks[mapped.crewChannelId] : undefined;
    pendingAuthor = msg.authorId;
    const onAsk = (botId: string, tool: string, args: Record<string, unknown>) => {
      queue.enqueue(`channel:${msg.channelId}`, () =>
        import("./rest").then(({ postDiscordMessage }) =>
          postDiscordMessage(token, msg.channelId, askCardPayload(botId, tool, args), fetchFn),
        ),
      );
    };
    await handleDiscordInbound({
      cfg,
      msg,
      say: (channelId, text, humanId) => input.say(channelId, text, humanId, onAsk),
      dm: input.dm
        ? (botId, text, humanId) => input.dm!(botId, text, humanId, onAsk)
        : undefined,
      botName: input.botName,
      postWebhook: async (row) => {
        if (hook) queue.enqueue(hook, () => executeDiscordWebhook(hook, row, fetchFn));
      },
      postSystem: async (text) => {
        if (hook) {
          queue.enqueue(hook, () =>
            executeDiscordWebhook(hook, { username: "Crew", content: text }, fetchFn),
          );
        }
      },
      postDm: async (text) => {
        queue.enqueue(`user:${msg.authorId}`, () =>
          import("./rest").then(({ sendDiscordUserDm }) =>
            sendDiscordUserDm(token, msg.authorId, text, fetchFn),
          ),
        );
      },
    });
  };
  const onInteraction = async (row: {
    id: string;
    token: string;
    userId: string;
    customId: string;
    channelId: string;
  }) => {
    const decision = decideAskClick({
      customId: row.customId,
      clickerId: row.userId,
      authorId: pendingAuthor,
    });
    const { respondDiscordInteraction } = await import("./rest");
    if (!decision) {
      await respondDiscordInteraction(
        row.id,
        row.token,
        { type: 4, data: { content: "Only the person who sent the message can decide.", flags: 64 } },
        fetchFn,
      );
      return;
    }
    input.onAskDecision?.(decision);
    await respondDiscordInteraction(
      row.id,
      row.token,
      { type: 7, data: { content: `Crew: ${decision}.`, components: [] } },
      fetchFn,
    );
  };
  const connect = input.connect ?? (await import("./live")).startDiscordGateway;
  await connect({ token, onMessage, onInteraction });
  return { started: true };
}
