import { expect, test } from "bun:test";
import { buildHistory } from "./prompt";
import {
  HISTORY_KEEP,
  lastSummary,
  maybeCompact,
  summarizeThread,
  summarizeTranscript,
} from "./compact";
import { MemoryEventStore } from "./store";
import { ScriptedProvider } from "./provider";
import type { CrewEvent } from "./events";
import type { ChatRequest, Provider } from "./provider";

function posted(id: string, who: string, text: string): CrewEvent {
  return {
    v: 1,
    id,
    ts: id,
    thread: { kind: "channel", id: "landing" },
    type: "message.posted",
    parent: null,
    payload:
      who === "human"
        ? { author: { kind: "human" }, text }
        : { author: { kind: "bot", botId: who }, text },
  };
}

test("buildHistory drops messages before the keep window and inserts a compact note", () => {
  const events = [
    posted("1", "human", "old job"),
    posted("2", "lead", "old plan"),
    posted("3", "human", "new job"),
    posted("4", "coder", "did it"),
  ];
  const hist = buildHistory(events, "coder", { keep: 2 });
  expect(hist[0]?.content).toContain("compacted");
  expect(hist.map((m) => m.content)).not.toContain("human: old job");
  expect(hist.at(-2)).toEqual({ role: "user", content: "human: new job" });
  expect(hist.at(-1)).toEqual({ role: "assistant", content: "did it" });
});

test("maybeCompact appends thread.compacted once the keep window is exceeded", () => {
  const store = new MemoryEventStore();
  const thread = { kind: "channel" as const, id: "landing" };
  for (let i = 0; i < 5; i++) {
    store.append(posted(String(i), "human", `m${i}`));
  }
  let n = 100;
  const clock = { nextId: () => `c${n++}`, now: () => "t" };
  const first = maybeCompact(store, thread, clock, 3);
  expect(first?.type).toBe("thread.compacted");
  expect(first?.payload.dropped).toBe(2);
  expect(first?.payload.keptFrom).toBe("2");
  const second = maybeCompact(store, thread, clock, 3);
  expect(second).toBeNull();
  expect(store.read(thread).filter((e) => e.type === "thread.compacted")).toHaveLength(1);
});

test("HISTORY_KEEP is 80", () => {
  expect(HISTORY_KEEP).toBe(80);
});

function summaryEvent(keptFrom: string, text: string): CrewEvent {
  return {
    v: 1,
    id: "sum1",
    ts: "t",
    thread: { kind: "channel", id: "landing" },
    type: "thread.summary",
    parent: null,
    payload: { text, keptFrom, model: "test-model", botId: null },
  };
}

test("buildHistory includes thread.summary and keeps posted after keptFrom verbatim", () => {
  const events = [
    posted("1", "human", "old job"),
    posted("2", "lead", "old plan"),
    posted("3", "human", "new job"),
    posted("4", "coder", "did it"),
    summaryEvent("3", "User intent: ship the hero."),
  ];
  const hist = buildHistory(events, "coder");
  expect(hist[0]?.content).toContain("[thread summary]");
  expect(hist[0]?.content).toContain("User intent: ship the hero.");
  expect(hist[0]?.content).toContain("Re-read paths you still need; disk is truth.");
  expect(hist.map((m) => m.content).join("\n")).not.toContain("human: old job");
  expect(hist.at(-2)).toEqual({ role: "user", content: "human: new job" });
  expect(hist.at(-1)).toEqual({ role: "assistant", content: "did it" });
});

test("buildHistory does not inject tool.completed bodies", () => {
  const events: CrewEvent[] = [
    posted("1", "human", "read the file"),
    {
      v: 1,
      id: "t1",
      ts: "t",
      thread: { kind: "channel", id: "landing" },
      type: "tool.completed",
      parent: null,
      payload: { name: "read", body: "SECRET FILE DUMP" },
    },
    posted("2", "coder", "I read it"),
  ];
  const hist = buildHistory(events, "coder");
  expect(JSON.stringify(hist)).not.toContain("SECRET FILE DUMP");
});

test("summarizeThread appends thread.summary and does not delete JSONL lines", async () => {
  const store = new MemoryEventStore();
  const thread = { kind: "channel" as const, id: "landing" };
  for (let i = 0; i < 5; i++) {
    store.append(posted(String(i), "human", `m${i}`));
  }
  const before = store.read(thread).length;
  let seen: ChatRequest | undefined;
  const inner = new ScriptedProvider([
    [{ type: "text-delta", text: "User intent: keep going.\nDecisions: none." }, { type: "done" }],
  ]);
  const provider: Provider = {
    complete(req) {
      seen = req;
      return inner.complete(req);
    },
  };
  let n = 200;
  const event = await summarizeThread({
    store,
    thread,
    provider,
    model: "test-model",
    clock: { nextId: () => `s${n++}`, now: () => "t" },
  });
  expect(event.type).toBe("thread.summary");
  expect(event.payload.text).toContain("User intent: keep going.");
  expect(event.payload.model).toBe("test-model");
  expect(event.payload.botId).toBeNull();
  expect(event.payload.keptFrom).toBe("0");
  expect(store.read(thread).length).toBe(before + 1);
  expect(store.read(thread).filter((e) => e.type === "message.posted")).toHaveLength(5);
  expect(lastSummary(store.read(thread))?.id).toBe(event.id);
  expect(seen?.tools).toEqual([]);
  expect(seen?.model).toBe("test-model");
  expect(String(seen?.messages[0]?.content)).toContain(
    "Summarize this thread for the next model. Sections: User intent; Decisions; Files touched (exact paths only); Errors; Remaining todos. Do not invent. Be concise.",
  );
  expect(String(seen?.messages[1]?.content)).toContain("human: m0");
  expect(String(seen?.messages[1]?.content)).toContain("human: m4");
});

test("summarizeThread uses last compact keptFrom and last 40 posted", async () => {
  const store = new MemoryEventStore();
  const thread = { kind: "channel" as const, id: "landing" };
  for (let i = 0; i < 45; i++) {
    store.append(posted(String(i), "human", `m${i}`));
  }
  let n = 100;
  const clock = { nextId: () => `c${n++}`, now: () => "t" };
  const compacted = maybeCompact(store, thread, clock, 3);
  expect(compacted?.payload.keptFrom).toBe("42");
  let seen: ChatRequest | undefined;
  const inner = new ScriptedProvider([
    [{ type: "text-delta", text: "User intent: late window." }, { type: "done" }],
  ]);
  const provider: Provider = {
    complete(req) {
      seen = req;
      return inner.complete(req);
    },
  };
  const event = await summarizeThread({
    store,
    thread,
    provider,
    model: "m",
    clock,
  });
  expect(event.payload.keptFrom).toBe("42");
  const transcript = String(seen?.messages[1]?.content);
  expect(transcript).not.toContain("human: m0");
  expect(transcript).toContain("human: m5");
  expect(transcript).toContain("human: m44");
});

test("summarizeThread prefixes system with soul when botId is set", async () => {
  const store = new MemoryEventStore();
  const thread = { kind: "channel" as const, id: "landing" };
  store.append(posted("1", "human", "hi"));
  let seen: ChatRequest | undefined;
  const inner = new ScriptedProvider([
    [{ type: "text-delta", text: "User intent: hi." }, { type: "done" }],
  ]);
  const provider: Provider = {
    complete(req) {
      seen = req;
      return inner.complete(req);
    },
  };
  const event = await summarizeThread({
    store,
    thread,
    provider,
    model: "m",
    botId: "coder",
    soul: "You are Coder. Short.",
    clock: { nextId: () => "s1", now: () => "t" },
  });
  expect(event.payload.botId).toBe("coder");
  expect(String(seen?.messages[0]?.content).startsWith("You are Coder. Short.")).toBe(true);
  expect(String(seen?.messages[0]?.content)).toContain("Summarize this thread");
});

test("summarizeTranscript prefixes last 40 posted with previous summary", () => {
  const events = [
    posted("1", "human", "old job"),
    posted("2", "lead", "old plan"),
    summaryEvent("1", "User intent: ship the hero."),
    posted("3", "human", "now the footer"),
    posted("4", "coder", "did it"),
  ];
  const text = summarizeTranscript(events);
  expect(text).toContain("[previous summary]");
  expect(text).toContain("User intent: ship the hero.");
  expect(text).toContain("human: now the footer");
  expect(text.indexOf("[previous summary]")).toBeLessThan(text.indexOf("human: now the footer"));
});

test("summarizeTranscript is last 40 posted when there is no summary", () => {
  expect(summarizeTranscript([posted("1", "human", "hi")])).toBe("human: hi");
});

test("summarizeThread throws on empty model text", async () => {
  const store = new MemoryEventStore();
  const thread = { kind: "channel" as const, id: "landing" };
  store.append(posted("1", "human", "hi"));
  const provider = new ScriptedProvider([[{ type: "text-delta", text: "   " }, { type: "done" }]]);
  await expect(
    summarizeThread({
      store,
      thread,
      provider,
      model: "m",
      clock: { nextId: () => "s1", now: () => "t" },
    }),
  ).rejects.toThrow("empty summary");
  expect(store.read(thread).some((e) => e.type === "thread.summary")).toBe(false);
});
