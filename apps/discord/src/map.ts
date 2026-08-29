import type { DiscordConfig } from "./config";

export type DiscordInbound = {
  guildId?: string;
  channelId: string;
  authorId: string;
  authorBot?: boolean;
  webhookId?: string;
  content: string;
};

export type MappedInbound = {
  ignore?: string;
  kind?: "channel" | "dm";
  crewChannelId?: string;
  botId?: string;
  humanId?: string;
  text?: string;
};

export function rewriteDiscordMentions(cfg: DiscordConfig, content: string): string {
  return String(content ?? "").replace(/<@!?(\d+)>/g, (full, id: string) => {
    const humanId = cfg.humans[id];
    return humanId ? `@${humanId}` : full;
  });
}

export function mapInbound(cfg: DiscordConfig, msg: DiscordInbound): MappedInbound {
  if (String(msg.webhookId ?? "").trim()) return { ignore: "webhook loop" };
  if (cfg.receptionistId && msg.authorId === cfg.receptionistId) return { ignore: "receptionist self" };
  const guild = String(msg.guildId ?? "").trim();
  const humanId = cfg.humans[msg.authorId];
  if (!guild) {
    if (!cfg.dmBotId) return { ignore: "dm disabled" };
    if (msg.authorBot && !cfg.botAuthors.includes(msg.authorId)) return { ignore: "unknown bot" };
    if (!humanId) return { ignore: "unknown author" };
    return {
      kind: "dm",
      botId: cfg.dmBotId,
      humanId,
      text: rewriteDiscordMentions(cfg, msg.content),
    };
  }
  if (guild !== cfg.guildId) return { ignore: "unknown guild" };
  const crewChannelId = cfg.channels[msg.channelId];
  if (!crewChannelId) return { ignore: "unknown channel" };
  if (msg.authorBot && !cfg.botAuthors.includes(msg.authorId)) return { ignore: "unknown bot" };
  if (!humanId) return { ignore: "unknown author" };
  return {
    kind: "channel",
    crewChannelId,
    humanId,
    text: rewriteDiscordMentions(cfg, msg.content),
  };
}
