import type { CrewEvent, ThreadRef } from "./events";
import type { Clock } from "./post";
import type { ChatEvent, Provider } from "./provider";
import type { EventStore } from "./store";

export const HISTORY_KEEP = 80;

export const SUMMARIZE_PROMPT =
  "Summarize this thread for the next model. Sections: User intent; Decisions; Files touched (exact paths only); Errors; Remaining todos. Do not invent. Be concise.";

export function lastCompact(events: CrewEvent[]): CrewEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]!.type === "thread.compacted") return events[i];
  }
  return undefined;
}

export function lastSummary(events: CrewEvent[]): CrewEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]!.type === "thread.summary") return events[i];
  }
  return undefined;
}

export function postedMessages(events: CrewEvent[]): CrewEvent[] {
  return events.filter((e) => e.type === "message.posted");
}

export function windowPosted(events: CrewEvent[], keep = HISTORY_KEEP): CrewEvent[] {
  const summary = lastSummary(events);
  const compact = lastCompact(events);
  let msgs = postedMessages(events);
  const keptFrom = summary
    ? String(summary.payload.keptFrom ?? "")
    : compact
      ? String(compact.payload.keptFrom ?? "")
      : "";
  if (keptFrom) {
    const i = msgs.findIndex((m) => m.id === keptFrom);
    if (i >= 0) msgs = msgs.slice(i);
  }
  if (msgs.length > keep) msgs = msgs.slice(-keep);
  return msgs;
}

function authorTag(event: CrewEvent): string {
  const author = event.payload.author as { kind?: string; botId?: string } | undefined;
  if (author?.kind === "human") return "human";
  return `@${author?.botId ?? "bot"}`;
}

export function summarizeTranscript(events: CrewEvent[]): string {
  const posted = postedMessages(events)
    .slice(-40)
    .map((event) => `${authorTag(event)}: ${String(event.payload.text ?? "")}`)
    .join("\n");
  const prev = lastSummary(events);
  if (!prev) return posted;
  return `[previous summary]\n${String(prev.payload.text ?? "")}\n\n${posted}`;
}

function eventText(event: ChatEvent): string {
  if (event.type === "text-delta") return event.text;
  const row = event as ChatEvent & { type: string; text?: string };
  if (row.type === "text" && typeof row.text === "string") return row.text;
  return "";
}

export async function summarizeThread(input: {
  store: EventStore;
  thread: ThreadRef;
  provider: Provider;
  model: string;
  clock: Clock;
  botId?: string | null;
  soul?: string | null;
}): Promise<CrewEvent> {
  const events = input.store.read(input.thread);
  const compact = lastCompact(events);
  const windowed = windowPosted(events);
  const keptFrom = compact
    ? String(compact.payload.keptFrom ?? "")
    : (windowed[0]?.id ?? "");
  const transcript = summarizeTranscript(events);
  const soul = input.soul?.trim();
  const system = soul ? `${soul}\n\n${SUMMARIZE_PROMPT}` : SUMMARIZE_PROMPT;
  const stream = input.provider.complete({
    model: input.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: transcript },
    ],
    tools: [],
  });
  let text = "";
  for await (const event of stream) {
    if (event.type === "error") throw new Error(event.message);
    text += eventText(event);
  }
  text = text.trim();
  if (!text) throw new Error("empty summary");
  const event: CrewEvent = {
    v: 1,
    id: input.clock.nextId(),
    ts: input.clock.now(),
    thread: input.thread,
    type: "thread.summary",
    parent: null,
    payload: {
      text,
      keptFrom,
      model: input.model,
      botId: input.botId ?? null,
    },
  };
  input.store.append(event);
  return event;
}

export function maybeCompact(
  store: EventStore,
  thread: ThreadRef,
  clock: Clock,
  keep = HISTORY_KEEP,
): CrewEvent | null {
  const events = store.read(thread);
  const msgs = postedMessages(events);
  if (msgs.length <= keep) return null;
  const kept = msgs[msgs.length - keep]!;
  const prev = lastCompact(events);
  if (prev && String(prev.payload.keptFrom ?? "") === kept.id) return null;
  const event: CrewEvent = {
    v: 1,
    id: clock.nextId(),
    ts: clock.now(),
    thread,
    type: "thread.compacted",
    parent: null,
    payload: {
      keptFrom: kept.id,
      dropped: msgs.length - keep,
    },
  };
  store.append(event);
  return event;
}
