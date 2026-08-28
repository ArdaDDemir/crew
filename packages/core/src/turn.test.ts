import { expect, test } from "bun:test";
import { MemoryEventStore } from "./store";
import { MemoryWorkspace } from "./workspace";
import { ScriptedProvider, type Provider } from "./provider";
import { runBotTurn, type Tool } from "./turn";

function seq() {
  let n = 0;
  return () => `evt_${++n}`;
}

const readTool: Tool = {
  name: "read",
  description: "Read a file",
  parameters: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  },
  async execute(args) {
    return `contents of ${String(args.path)}`;
  },
};

test("streams text then a tool then a final reply", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder", soul: "You write code." });
  workspace.addChannel({
    id: "landing",
    leadBotId: "coder",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
    rules: "Be brief.",
    context: "Next.js app.",
  });
  const thread = { kind: "channel" as const, id: "landing" };
  store.append({
    v: 1,
    id: "seed",
    ts: "t",
    thread,
    type: "message.posted",
    parent: null,
    payload: { author: { kind: "human" }, text: "read pkg", mentions: ["coder"] },
  });

  const provider = new ScriptedProvider([
    [
      { type: "text-delta", text: "checking" },
      {
        type: "tool-call",
        id: "call_1",
        name: "read",
        arguments: JSON.stringify({ path: "package.json" }),
      },
      { type: "done" },
    ],
    [
      { type: "text-delta", text: "looks good" },
      { type: "done" },
    ],
  ]);

  const result = await runBotTurn({
    store,
    workspace,
    provider,
    tools: [readTool],
    nextId: seq(),
    now: () => "2026-08-27T12:00:00.000Z",
    thread,
    botId: "coder",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });

  expect(result.text).toEqual("looks good");
  expect(result.toolNames).toEqual(["read"]);
  const types = store.read(thread).map((e) => e.type);
  expect(types).toContain("bot.turn.started");
  expect(types).toContain("tool.requested");
  expect(types).toContain("tool.completed");
  expect(types).toContain("bot.turn.completed");
});

test("hard-denied .env does not call the tool", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "full-access",
  });
  const thread = { kind: "channel" as const, id: "landing" };
  store.append({
    v: 1,
    id: "seed",
    ts: "t",
    thread,
    type: "message.posted",
    parent: null,
    payload: { author: { kind: "human" }, text: "secrets", mentions: [] },
  });

  let executed = false;
  const provider = new ScriptedProvider([
    [
      {
        type: "tool-call",
        id: "call_1",
        name: "read",
        arguments: JSON.stringify({ path: ".env" }),
      },
      { type: "done" },
    ],
    [{ type: "text-delta", text: "blocked" }, { type: "done" }],
  ]);

  const result = await runBotTurn({
    store,
    workspace,
    provider,
    tools: [
      {
        ...readTool,
        async execute() {
          executed = true;
          return "secret";
        },
      },
    ],
    nextId: seq(),
    now: () => "t",
    thread,
    botId: "coder",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });

  expect(executed).toBe(false);
  expect(result.text).toEqual("blocked");
});

test("bot.model overrides the workspace default model", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder", model: "z-ai/glm-5.3-flash" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  let seen = "";
  const provider: Provider = {
    async *complete(req) {
      seen = req.model;
      yield { type: "text-delta", text: "ok" };
      yield { type: "done" };
    },
  };
  await runBotTurn({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    thread: { kind: "channel", id: "landing" },
    botId: "coder",
    model: "openai/other",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(seen).toBe("z-ai/glm-5.3-flash");
});

test("channel turn is told when a newer human DM wins", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  const channel = { kind: "channel" as const, id: "landing" };
  const dm = { kind: "dm" as const, id: "human__coder" };
  store.append({
    v: 1,
    id: "a",
    ts: "2026-08-27T15:00:00.000Z",
    thread: channel,
    type: "message.posted",
    parent: null,
    payload: { author: { kind: "human" }, text: "Set title to FlowHub @coder" },
  });
  store.append({
    v: 1,
    id: "b",
    ts: "2026-08-27T15:06:00.000Z",
    thread: dm,
    type: "dm.opened",
    parent: null,
    payload: {
      participants: [{ kind: "human" }, { kind: "bot", botId: "coder" }],
    },
  });
  store.append({
    v: 1,
    id: "c",
    ts: "2026-08-27T15:07:00.000Z",
    thread: dm,
    type: "message.posted",
    parent: null,
    payload: {
      author: { kind: "human" },
      text: "Do not change index.html. Title stays Landing.",
    },
  });
  let lastUser = "";
  const provider: Provider = {
    async *complete(req) {
      const last = req.messages.at(-1);
      lastUser =
        last && last.role === "user" && "content" in last ? last.content : "";
      yield { type: "text-delta", text: "ok" };
      yield { type: "done" };
    },
  };
  await runBotTurn({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    thread: channel,
    botId: "coder",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(lastUser).toContain("wins");
  expect(lastUser).toContain("Title stays Landing");
});

test("onStatus and onEvent fire while the model streams", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "lead", name: "Lead" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["lead"],
    permissionMode: "auto-accept",
  });
  const seen: string[] = [];
  await runBotTurn({
    store,
    workspace,
    provider: new ScriptedProvider([
      [{ type: "text-delta", text: "hi" }, { type: "done" }],
    ]),
    tools: [],
    nextId: seq(),
    now: () => "t",
    thread: { kind: "channel", id: "landing" },
    botId: "lead",
    model: "z-ai/glm-5.3-flash",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
    onStatus: (m) => seen.push(m),
    onEvent: (e) => seen.push(e.type),
  });
  expect(seen[0]).toContain("lead → z-ai/glm-5.3-flash");
  expect(seen).toContain("text-delta");
});

test("desk-round text is not forwarded as channel text-delta", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  const thread = { kind: "channel" as const, id: "landing" };
  store.append({
    v: 1,
    id: "seed",
    ts: "t",
    thread,
    type: "message.posted",
    parent: null,
    payload: { author: { kind: "human" }, text: "read pkg", mentions: ["coder"] },
  });
  const seen: string[] = [];
  const result = await runBotTurn({
    store,
    workspace,
    provider: new ScriptedProvider([
      [
        { type: "text-delta", text: "checking files" },
        {
          type: "tool-call",
          id: "call_1",
          name: "read",
          arguments: JSON.stringify({ path: "package.json" }),
        },
        { type: "done" },
      ],
      [{ type: "text-delta", text: "bak package.json okudum" }, { type: "done" }],
    ]),
    tools: [readTool],
    nextId: seq(),
    now: () => "t",
    thread,
    botId: "coder",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
    onEvent: (e) => {
      if (e.type === "text-delta") seen.push(e.text);
    },
  });
  expect(result.text).toBe("bak package.json okudum");
  expect(seen.join("")).toBe("bak package.json okudum");
  expect(seen.join("")).not.toContain("checking files");
});

test("after tools, next model call is nudged to give an account", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  const seen: string[] = [];
  const provider: Provider = {
    async *complete(req) {
      const last = req.messages.at(-1);
      seen.push(`${last?.role}:${"content" in last! ? last.content : ""}`);
      if (seen.length === 1) {
        yield {
          type: "tool-call",
          id: "call_1",
          name: "read",
          arguments: JSON.stringify({ path: "package.json" }),
        };
        yield { type: "done" };
        return;
      }
      yield { type: "text-delta", text: "bak okudum" };
      yield { type: "done" };
    },
  };
  await runBotTurn({
    store,
    workspace,
    provider,
    tools: [readTool],
    nextId: seq(),
    now: () => "t",
    thread: { kind: "channel", id: "landing" },
    botId: "coder",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(seen[1]).toContain("user:");
  expect(seen[1].toLowerCase()).toContain("give an account");
});

test("bot_create tool persists a new bot on the workspace", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "lead", name: "Lead" });
  workspace.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead"],
    permissionMode: "auto-accept",
  });
  const provider = new ScriptedProvider([
    [
      {
        type: "tool-call",
        id: "c1",
        name: "bot_create",
        arguments: JSON.stringify({ id: "writer", name: "Writer", soul: "You write." }),
      },
      { type: "done" },
    ],
    [{ type: "text-delta", text: "hired a writer" }, { type: "done" }],
  ]);
  const result = await runBotTurn({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    thread: { kind: "channel", id: "landing" },
    botId: "lead",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(result.toolNames).toContain("bot_create");
  expect(workspace.getBot("writer")?.name).toBe("Writer");
  expect(workspace.getChannel("landing")?.memberBotIds).toContain("writer");
});

test("bot.fallbackModel is used when the primary model errors", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({
    id: "coder",
    name: "Coder",
    model: "broken/model",
    fallbackModel: "ok/model",
  });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  const seen: string[] = [];
  const provider: Provider = {
    async *complete(req) {
      seen.push(req.model);
      if (req.model === "broken/model") {
        yield { type: "error", message: "provider 500: boom" };
        yield { type: "done" };
        return;
      }
      yield { type: "text-delta", text: "recovered" };
      yield { type: "done" };
    },
  };
  const result = await runBotTurn({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    thread: { kind: "channel", id: "landing" },
    botId: "coder",
    model: "workspace/default",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(seen).toEqual(["broken/model", "ok/model"]);
  expect(result.text).toBe("recovered");
  expect(result.error).toBeUndefined();
});

test("inference processing failed retries once without tools", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  const seenTools: boolean[] = [];
  const provider: Provider = {
    async *complete(req) {
      seenTools.push(Boolean(req.tools?.length));
      if (seenTools.length === 1) {
        yield { type: "error", message: "Inference processing failed" };
        yield { type: "done" };
        return;
      }
      yield { type: "text-delta", text: "bak dosyaya bakamadım, tekrar denerim" };
      yield { type: "done" };
    },
  };
  const result = await runBotTurn({
    store,
    workspace,
    provider,
    tools: [readTool],
    nextId: seq(),
    now: () => "t",
    thread: { kind: "channel", id: "landing" },
    botId: "coder",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(seenTools).toEqual([true, false]);
  expect(result.error).toBeUndefined();
  expect(result.text).toContain("bak dosyaya bakamadım");
});

test("bindModel wins over bot.model for harness turns", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder", model: "z-ai/glm-5.3-flash", harness: "grok" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  const seen: string[] = [];
  const provider: Provider = {
    async *complete(req) {
      seen.push(req.model);
      yield { type: "text-delta" as const, text: "from grok" };
      yield { type: "done" as const };
    },
  };
  const result = await runBotTurn({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    thread: { kind: "channel", id: "landing" },
    botId: "coder",
    model: "workspace-default",
    bindModel: "grok-4.6",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(seen).toEqual(["grok-4.6"]);
  expect(result.text).toBe("from grok");
});

test("provider error is returned on the turn, not swallowed", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "lead", name: "Lead" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["lead"],
    permissionMode: "auto-accept",
  });
  const thread = { kind: "channel" as const, id: "landing" };
  const result = await runBotTurn({
    store,
    workspace,
    provider: new ScriptedProvider([
      [{ type: "error", message: "provider 429: rate-limited" }, { type: "done" }],
    ]),
    tools: [],
    nextId: seq(),
    now: () => "t",
    thread,
    botId: "lead",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(result.error).toContain("429");
  expect(result.text).toBe("");
  expect(store.read(thread).some((e) => e.type === "error")).toBe(true);
});
