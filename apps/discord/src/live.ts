import type { DiscordInbound } from "./map";

const INTENTS = 1 + 512 + 4096 + 32768; // Guilds + GuildMessages + DirectMessages + MessageContent

export type DiscordInteraction = {
  id: string;
  token: string;
  userId: string;
  customId: string;
  channelId: string;
};

export type DiscordConnect = (input: {
  token: string;
  onMessage: (msg: DiscordInbound) => Promise<void>;
  onInteraction?: (row: DiscordInteraction) => Promise<void>;
}) => Promise<void>;

export async function startDiscordGateway(input: {
  token: string;
  onMessage: (msg: DiscordInbound) => Promise<void>;
  onInteraction?: (row: DiscordInteraction) => Promise<void>;
  fetchFn?: typeof fetch;
}): Promise<void> {
  const fetchFn = input.fetchFn ?? fetch;
  const info = (await (
    await fetchFn("https://discord.com/api/v10/gateway", {
      headers: { Authorization: `Bot ${input.token}` },
    })
  ).json()) as { url?: string };
  const url = String(info.url ?? "").trim();
  if (!url) throw new Error("discord gateway url missing");
  const ws = new WebSocket(`${url}?v=10&encoding=json`);
  let seq: number | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  ws.addEventListener("message", (ev) => {
    let payload: { op?: number; s?: number | null; t?: string; d?: Record<string, unknown> };
    try {
      payload = JSON.parse(String(ev.data)) as typeof payload;
    } catch {
      return;
    }
    if (typeof payload.s === "number") seq = payload.s;
    if (payload.op === 10) {
      const interval = Number((payload.d as { heartbeat_interval?: number })?.heartbeat_interval ?? 41250);
      heartbeat = setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: seq }));
      }, interval);
      ws.send(
        JSON.stringify({
          op: 2,
          d: {
            token: input.token,
            intents: INTENTS,
            properties: { os: "windows", browser: "crew", device: "crew" },
          },
        }),
      );
      return;
    }
    if (payload.t === "INTERACTION_CREATE" && payload.d) {
      const d = payload.d;
      const data = (d.data as { custom_id?: string } | undefined) ?? {};
      const memberUser = (d.member as { user?: { id?: string } } | undefined)?.user;
      const user = (d.user as { id?: string } | undefined) ?? memberUser;
      void input.onInteraction?.({
        id: String(d.id ?? ""),
        token: String(d.token ?? ""),
        userId: String(user?.id ?? ""),
        customId: String(data.custom_id ?? ""),
        channelId: String(d.channel_id ?? ""),
      });
      return;
    }
    if (payload.t !== "MESSAGE_CREATE" || !payload.d) return;
    const d = payload.d;
    const author = (d.author as { id?: string; bot?: boolean } | undefined) ?? {};
    const msg: DiscordInbound = {
      guildId: d.guild_id ? String(d.guild_id) : undefined,
      channelId: String(d.channel_id ?? ""),
      authorId: String(author.id ?? ""),
      authorBot: Boolean(author.bot),
      webhookId: d.webhook_id ? String(d.webhook_id) : undefined,
      content: String(d.content ?? ""),
    };
    void input.onMessage(msg);
  });
  ws.addEventListener("close", () => {
    if (heartbeat) clearInterval(heartbeat);
  });
}
