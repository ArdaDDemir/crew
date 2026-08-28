export type ThreadRef =
  | { kind: "channel"; id: string }
  | { kind: "dm"; id: string };

export type CrewEvent = {
  v: 1;
  id: string;
  ts: string;
  thread: ThreadRef;
  type: string;
  parent: string | null;
  payload: Record<string, unknown>;
};

export function threadKey(thread: ThreadRef): string {
  return `${thread.kind}:${thread.id}`;
}

export function dmThreadId(
  a: { kind: "human" } | { kind: "bot"; botId: string },
  b: { kind: "human" } | { kind: "bot"; botId: string },
): string {
  if (a.kind === "human" && b.kind === "bot") return `human__${b.botId}`;
  if (b.kind === "human" && a.kind === "bot") return `human__${a.botId}`;
  if (a.kind === "bot" && b.kind === "bot") {
    return [a.botId, b.botId].sort().join("__");
  }
  throw new Error("DM requires at least one bot");
}

export type ParsedDmThread = {
  pair: string;
  conv: string;
  withHuman: boolean;
  left: string;
  right: string;
};

export function parseDmThreadId(id: string): ParsedDmThread {
  const parts = String(id).split("__").filter(Boolean);
  if (parts.length < 2) throw new Error(`invalid dm thread: ${id}`);
  if (parts[0] === "human") {
    const bot = parts[1]!;
    return {
      pair: `human__${bot}`,
      conv: parts.slice(2).join("__"),
      withHuman: true,
      left: "human",
      right: bot,
    };
  }
  const left = parts[0]!;
  const right = parts[1]!;
  return {
    pair: `${left}__${right}`,
    conv: parts.slice(2).join("__"),
    withHuman: false,
    left,
    right,
  };
}

export function dmConversationId(pair: string, conv: string): string {
  return conv ? `${pair}__${conv}` : pair;
}
