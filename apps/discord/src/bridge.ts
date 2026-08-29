import type { DiscordConfig } from "./config";
import { mapInbound, type DiscordInbound } from "./map";

export type DiscordAsk = (
  botId: string,
  tool: string,
  args: Record<string, unknown>,
) => void;

export type DiscordSay = (
  channelId: string,
  text: string,
  humanId?: string,
  onAsk?: DiscordAsk,
) => Promise<{
  replies: { botId: string; text: string; error?: string }[];
  held?: { text: string };
  ignored?: { text: string };
}>;

export type DiscordDm = (
  botId: string,
  text: string,
  humanId?: string,
  onAsk?: DiscordAsk,
) => Promise<{
  replies: { botId: string; text: string; error?: string }[];
}>;

export async function handleDiscordInbound(input: {
  cfg: DiscordConfig;
  msg: DiscordInbound;
  say: DiscordSay;
  dm?: DiscordDm;
  botName: (botId: string) => string;
  postWebhook: (row: { username: string; content: string }) => Promise<void>;
  postSystem: (text: string) => Promise<void>;
  postDm?: (text: string) => Promise<void>;
}): Promise<{ ignore?: string }> {
  const mapped = mapInbound(input.cfg, input.msg);
  if (mapped.ignore || !mapped.text) {
    return { ignore: mapped.ignore ?? "ignored" };
  }
  const humanId = mapped.humanId === "human" ? undefined : mapped.humanId;
  if (mapped.kind === "dm") {
    if (!mapped.botId || !input.dm) return { ignore: mapped.ignore ?? "dm disabled" };
    const result = await input.dm(mapped.botId, mapped.text, humanId);
    for (const reply of result.replies) {
      const text = String(reply.text ?? "").trim();
      if (!text || reply.error) continue;
      await input.postDm?.(text);
    }
    return {};
  }
  if (!mapped.crewChannelId) return { ignore: mapped.ignore ?? "ignored" };
  const result = await input.say(mapped.crewChannelId, mapped.text, humanId);
  for (const reply of result.replies) {
    const text = String(reply.text ?? "").trim();
    if (!text || reply.error) continue;
    await input.postWebhook({ username: input.botName(reply.botId), content: text });
  }
  if (result.ignored?.text) await input.postSystem(result.ignored.text);
  if (result.held?.text) await input.postSystem(result.held.text);
  return {};
}
