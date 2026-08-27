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
