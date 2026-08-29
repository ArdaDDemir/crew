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

export const OWNER_HUMAN_ID = "human";

export type HumanRef = { kind: "human"; humanId?: string };
export type BotRef = { kind: "bot"; botId: string };

export function humanIdOf(author: { kind?: string; humanId?: string } | undefined): string {
  if (author?.kind !== "human") return "";
  const id = String(author.humanId ?? "").trim();
  return id || OWNER_HUMAN_ID;
}

export function humanAuthor(humanId?: string): HumanRef {
  const id = String(humanId ?? "").trim();
  if (!id || id === OWNER_HUMAN_ID) return { kind: "human" };
  return { kind: "human", humanId: id };
}

function dmHumanBot(human: HumanRef, botId: string): string {
  const id = humanIdOf(human);
  if (id === OWNER_HUMAN_ID) return `human__${botId}`;
  return `user__${id}__${botId}`;
}

export function dmThreadId(a: HumanRef | BotRef, b: HumanRef | BotRef): string {
  if (a.kind === "human" && b.kind === "bot") return dmHumanBot(a, b.botId);
  if (b.kind === "human" && a.kind === "bot") return dmHumanBot(b, a.botId);
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
  if (parts[0] === "user") {
    if (parts.length < 3) throw new Error(`invalid dm thread: ${id}`);
    const humanId = parts[1]!;
    const bot = parts[2]!;
    return {
      pair: `user__${humanId}__${bot}`,
      conv: parts.slice(3).join("__"),
      withHuman: true,
      left: humanId,
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
