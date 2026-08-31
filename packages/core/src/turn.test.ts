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

test("onToolDone fires after tool.completed with name and output", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    leadBotId: "coder",
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
  const done: { name: string; output: string }[] = [];
  await runBotTurn({
    store,
    workspace,
    provider: new ScriptedProvider([
      [
        {
          type: "tool-call",
          id: "call_1",
          name: "read",
          arguments: JSON.stringify({ path: "package.json" }),
        },
        { type: "done" },
      ],
      [{ type: "text-delta", text: "ok" }, { type: "done" }],
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
    onToolDone: (row) => done.push(row),
  });
  expect(done).toEqual([{ name: "read", output: "contents of package.json" }]);
});

test("hard-denied shell is denied without asking", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  let ran = false;
  let asked = 0;
  const shellTool: Tool = {
    name: "shell",
    description: "Run a program",
    parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    async execute() {
      ran = true;
      return "ok";
    },
  };
  const result = await runBotTurn({
    store,
    workspace,
    provider: new ScriptedProvider([
      [
        {
          type: "tool-call",
          id: "call_1",
          name: "shell",
          arguments: JSON.stringify({ command: "type .env" }),
        },
        { type: "done" },
      ],
      [{ type: "text-delta", text: "I could not read secrets." }, { type: "done" }],
    ]),
    tools: [shellTool],
    nextId: seq(),
    now: () => "t",
    thread: { kind: "channel", id: "landing" },
    botId: "coder",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => {
      asked += 1;
      return "allow";
    },
    hasReviewer: false,
  });
  expect(ran).toBe(false);
  expect(asked).toBe(0);
  expect(result.toolNames).toContain("shell");
  const done = store.read({ kind: "channel", id: "landing" }).find((e) => e.type === "tool.completed");
  expect(String(done?.payload.output ?? "")).toContain("permission denied");
});

test("hard-denied file:// browser open is denied without asking", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "full-access",
  });
  let ran = false;
  let asked = 0;
  const openTool: Tool = {
    name: "browser_open",
    description: "Open a page",
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    async execute() {
      ran = true;
      return "opened";
    },
  };
  await runBotTurn({
    store,
    workspace,
    provider: new ScriptedProvider([
      [
        {
          type: "tool-call",
          id: "call_1",
          name: "browser_open",
          arguments: JSON.stringify({ url: "file:///C:/.env" }),
        },
        { type: "done" },
      ],
      [{ type: "text-delta", text: "I will not open local files." }, { type: "done" }],
    ]),
    tools: [openTool],
    nextId: seq(),
    now: () => "t",
    thread: { kind: "channel", id: "landing" },
    botId: "coder",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => {
      asked += 1;
      return "allow";
    },
    hasReviewer: false,
  });
  expect(ran).toBe(false);
  expect(asked).toBe(0);
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

test("empty account after tools gets an English stop line", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  const thread = { kind: "channel" as const, id: "landing" };
  const seen: string[] = [];
  const result = await runBotTurn({
    store,
    workspace,
    provider: new ScriptedProvider([
      [
        {
          type: "tool-call",
          id: "call_1",
          name: "read",
          arguments: JSON.stringify({ path: "package.json" }),
        },
        { type: "done" },
      ],
      [{ type: "done" }],
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
  expect(result.text).toBe("I stopped after 1 tool call(s) without a channel account.");
  expect(seen.join("")).toContain("I stopped after 1 tool call(s)");
  const completed = store.read(thread).find((e) => e.type === "bot.turn.completed");
  expect(completed?.payload.text).toBe(result.text);
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
  const retries: string[] = [];
  const provider: Provider = {
    async *complete(req) {
      seenTools.push(Boolean(req.tools?.length));
      if (seenTools.length === 1) {
        yield { type: "error", message: "Inference processing failed" };
        yield { type: "done" };
        return;
      }
      const last = req.messages.at(-1);
      retries.push(typeof last?.content === "string" ? last.content : "");
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
  expect(retries[0]?.toLowerCase()).toContain("cannot use tools");
  expect(retries[0]?.toLowerCase()).toContain("do not claim");
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

test("DM turn honors permissionMode instead of hardcoded auto-accept", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  const thread = { kind: "dm" as const, id: "human__coder" };
  store.append({
    v: 1,
    id: "seed",
    ts: "t",
    thread,
    type: "message.posted",
    parent: null,
    payload: { author: { kind: "human" }, text: "patch it", mentions: [] },
  });
  let executed = false;
  let asked = 0;
  const patch: Tool = {
    name: "apply_patch",
    description: "patch",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    async execute() {
      executed = true;
      return "ok";
    },
  };
  await runBotTurn({
    store,
    workspace,
    provider: new ScriptedProvider([
      [
        {
          type: "tool-call",
          id: "c1",
          name: "apply_patch",
          arguments: JSON.stringify({ path: "a.ts", old_text: "a", new_text: "b" }),
        },
        { type: "done" },
      ],
      [{ type: "text-delta", text: "stopped" }, { type: "done" }],
    ]),
    tools: [patch],
    nextId: seq(),
    now: () => "t",
    thread,
    botId: "coder",
    model: "test",
    workspaceRoot: "/proj",
    permissionMode: "supervised",
    ask: async () => {
      asked += 1;
      return "deny";
    },
    hasReviewer: false,
  });
  expect(asked).toBe(1);
  expect(executed).toBe(false);
});

test("auto with reviewer allow skips the human ask", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto",
  });
  const thread = { kind: "channel" as const, id: "landing" };
  store.append({
    v: 1,
    id: "seed",
    ts: "t",
    thread,
    type: "message.posted",
    parent: null,
    payload: { author: { kind: "human" }, text: "patch", mentions: ["coder"] },
  });
  let executed = false;
  let asked = 0;
  let reviewed = 0;
  const patch: Tool = {
    name: "apply_patch",
    description: "patch",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    async execute() {
      executed = true;
      return "ok";
    },
  };
  await runBotTurn({
    store,
    workspace,
    provider: new ScriptedProvider([
      [
        {
          type: "tool-call",
          id: "c1",
          name: "apply_patch",
          arguments: JSON.stringify({ path: "a.ts", old_text: "a", new_text: "b" }),
        },
        { type: "done" },
      ],
      [{ type: "text-delta", text: "done" }, { type: "done" }],
    ]),
    tools: [patch],
    nextId: seq(),
    now: () => "t",
    thread,
    botId: "coder",
    model: "test",
    workspaceRoot: "/proj",
    hasReviewer: true,
    review: async () => {
      reviewed += 1;
      return "allow";
    },
    ask: async () => {
      asked += 1;
      return "deny";
    },
  });
  expect(reviewed).toBe(1);
  expect(asked).toBe(0);
  expect(executed).toBe(true);
  expect(store.read(thread).some((e) => e.type === "permission.resolved" && e.payload.reviewer === true)).toBe(
    true,
  );
});

test("bot effort rides into the provider request", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder", model: "z-ai/glm-5.3-flash", effort: "high" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  let seen: string | undefined;
  const provider: Provider = {
    async *complete(req) {
      seen = req.effort;
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
  expect(seen).toBe("high");
});
