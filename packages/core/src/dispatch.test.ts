import { expect, test } from "bun:test";
import { MemoryEventStore } from "./store";
import { MemoryWorkspace } from "./workspace";
import { ScriptedProvider, type Provider } from "./provider";
import { dispatchChannelPost } from "./dispatch";

function seq() {
  let n = 0;
  return () => `evt_${++n}`;
}

test("woken bots reply in parallel and a @handoff wakes the next bot", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "lead", name: "Lead" });
  workspace.addBot({ id: "designer", name: "Designer" });
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead", "designer", "coder"],
    permissionMode: "auto-accept",
  });

  const provider = new ScriptedProvider([
    [{ type: "text-delta", text: "@designer hero @coder api" }, { type: "done" }],
    [{ type: "text-delta", text: "hero done" }, { type: "done" }],
    [{ type: "text-delta", text: "api done" }, { type: "done" }],
  ]);

  const result = await dispatchChannelPost({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    channelId: "landing",
    text: "kick off",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });

  expect(result.woken).toEqual(["lead"]);
  const replies = result.replies.map((r) => `${r.botId}:${r.text}`);
  expect(replies).toContain("lead:@designer hero @coder api");
  expect(replies).toContain("designer:hero done");
  expect(replies).toContain("coder:api done");
});

test("providerForBot binds a different provider per woken bot", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "lead", name: "Lead" });
  workspace.addBot({ id: "coder", name: "Coder", harness: "grok" });
  workspace.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead", "coder"],
    permissionMode: "auto-accept",
  });
  const grok = new ScriptedProvider([[{ type: "text-delta", text: "grok account" }, { type: "done" }]]);
  const openrouter = new ScriptedProvider([[{ type: "text-delta", text: "or account" }, { type: "done" }]]);
  const result = await dispatchChannelPost({
    store,
    workspace,
    provider: openrouter,
    providerForBot: (botId) => (botId === "coder" ? { provider: grok, model: "grok-4.6" } : undefined),
    tools: [],
    nextId: seq(),
    now: () => "t",
    channelId: "landing",
    text: "@lead @coder",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  const replies = Object.fromEntries(result.replies.map((r) => [r.botId, r.text]));
  expect(replies.lead).toBe("or account");
  expect(replies.coder).toBe("grok account");
});

test("a bot that already spoke this say is not woken again by courtesy @", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "lead", name: "Lead" });
  workspace.addBot({ id: "designer", name: "Designer" });
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addBot({ id: "tester", name: "Tester" });
  workspace.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead", "designer", "coder", "tester"],
    permissionMode: "auto-accept",
  });

  const provider = new ScriptedProvider([
    [{ type: "text-delta", text: "hero already in file @coder @lead" }, { type: "done" }],
    [{ type: "text-delta", text: "hero already placed. need human for title @lead @tester" }, { type: "done" }],
    [{ type: "text-delta", text: "waiting on you for Devam" }, { type: "done" }],
    [{ type: "text-delta", text: "hero checks out" }, { type: "done" }],
  ]);

  const result = await dispatchChannelPost({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    channelId: "landing",
    text: "@designer hero yaz. @coder index.html'e koy.",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });

  const who = result.replies.map((r) => r.botId);
  expect(who).toEqual(["designer", "coder"]);
});

test("unknown @ghost is announced and does not wake", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    leadBotId: "coder",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  const result = await dispatchChannelPost({
    store,
    workspace,
    provider: new ScriptedProvider([
      [{ type: "text-delta", text: "I am on it" }, { type: "done" }],
    ]),
    tools: [],
    nextId: seq(),
    now: () => "t",
    channelId: "landing",
    text: "@ghost then @coder go",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(result.replies.map((r) => r.botId)).toEqual(["coder"]);
  expect(result.ignored?.names).toEqual(["ghost"]);
  expect(result.ignored?.text).toMatch(/@ghost/);
  expect(result.ignored?.text.toLowerCase()).toMatch(/not a member/);
  const events = store.read({ kind: "channel", id: "landing" });
  const ignored = events.filter((e) => e.type === "mention.ignored");
  expect(ignored).toHaveLength(1);
  expect(ignored[0]?.payload.ignored).toEqual(["ghost"]);
});

test("human-tagged say holds @ of member bots who did not run", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "designer", name: "Designer" });
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    leadBotId: "designer",
    memberBotIds: ["designer", "coder"],
    permissionMode: "auto-accept",
  });
  const result = await dispatchChannelPost({
    store,
    workspace,
    provider: new ScriptedProvider([
      [{ type: "text-delta", text: "hero done @coder put this in index.html" }, { type: "done" }],
    ]),
    tools: [],
    nextId: seq(),
    now: () => "t",
    channelId: "landing",
    text: "@designer hero yaz",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(result.replies.map((r) => r.botId)).toEqual(["designer"]);
  expect(result.held?.waiting).toEqual(["coder"]);
  expect(result.held?.text).toMatch(/@coder/);
  expect(result.held?.text).toMatch(/next message/i);
  const events = store.read({ kind: "channel", id: "landing" });
  const held = events.filter((e) => e.type === "handoff.held");
  expect(held).toHaveLength(1);
  expect(held[0]?.payload.waiting).toEqual(["coder"]);
});

test("dm_send does not give a second turn to a bot who already spoke this say", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "designer", name: "Designer" });
  workspace.addBot({ id: "tester", name: "Tester" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["designer", "tester"],
    permissionMode: "auto-accept",
  });
  let designerRounds = 0;
  const provider: Provider = {
    async *complete(req: { messages: Array<{ role?: string; content?: string }> }) {
      const sys = String(req.messages[0]?.content ?? "");
      if (sys.includes("id: tester")) {
        yield { type: "text-delta" as const, text: "tester in the channel" };
        yield { type: "done" as const };
        return;
      }
      designerRounds += 1;
      if (designerRounds === 1) {
        yield {
          type: "tool-call" as const,
          id: "d1",
          name: "dm_send",
          arguments: JSON.stringify({ to: "tester", text: "secret" }),
        };
        yield { type: "done" as const };
        return;
      }
      yield { type: "text-delta" as const, text: "designer accounted" };
      yield { type: "done" as const };
    },
  };
  const result = await dispatchChannelPost({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    channelId: "landing",
    text: "@designer @tester go",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(result.replies.map((r) => r.botId).sort()).toEqual(["designer", "tester"]);
  expect(result.dms).toEqual([]);
  expect(store.read({ kind: "dm", id: "designer__tester" }).some((e) => e.type === "message.posted")).toBe(
    true,
  );
});

test("channel dm_send opens a DM and wakes the other bot once", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "designer", name: "Designer" });
  workspace.addBot({ id: "tester", name: "Tester" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["designer", "tester"],
    permissionMode: "auto-accept",
  });
  const provider = new ScriptedProvider([
    [
      {
        type: "tool-call",
        id: "d1",
        name: "dm_send",
        arguments: JSON.stringify({ to: "tester", text: "hero is in #hero" }),
      },
      { type: "done" },
    ],
    [{ type: "text-delta", text: "hero v2 yazdim, notu DM attim" }, { type: "done" }],
    [{ type: "text-delta", text: "notu aldim, dosya degisince bakarim" }, { type: "done" }],
  ]);
  const result = await dispatchChannelPost({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    channelId: "landing",
    text: "@designer hero yaz",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(result.woken).toEqual(["designer"]);
  expect(result.replies.map((r) => r.botId)).toEqual(["designer"]);
  expect(result.dms).toHaveLength(1);
  expect(result.dms[0]?.botId).toBe("tester");
  expect(result.dms[0]?.threadId).toBe("designer__tester");
  expect(result.dms[0]?.text).toContain("notu aldim");
  const dm = store.read({ kind: "dm", id: "designer__tester" });
  expect(dm.some((e) => e.type === "dm.opened")).toBe(true);
  expect(
    dm.filter((e) => e.type === "message.posted").map((e) => e.payload.text),
  ).toContain("hero is in #hero");
});

test("named human say stores humanId; dm_send uses that human's DM", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  const provider = new ScriptedProvider([
    [
      {
        type: "tool-call",
        id: "d1",
        name: "dm_send",
        arguments: JSON.stringify({ to: "human", text: "need the hero copy" }),
      },
      { type: "done" },
    ],
    [{ type: "text-delta", text: "I pinged you in DM" }, { type: "done" }],
  ]);
  const result = await dispatchChannelPost({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    channelId: "landing",
    text: "@coder go",
    humanId: "arda",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(result.dms).toEqual([]);
  const posted = store
    .read({ kind: "channel", id: "landing" })
    .find((e) => e.type === "message.posted");
  expect(posted?.payload.author).toEqual({ kind: "human", humanId: "arda" });
  expect(store.read({ kind: "dm", id: "human__coder" }).length).toBe(0);
  const dm = store.read({ kind: "dm", id: "user__arda__coder" });
  expect(dm.some((e) => e.type === "dm.opened")).toBe(true);
  expect(
    dm.filter((e) => e.type === "message.posted").map((e) => e.payload.text),
  ).toContain("need the hero copy");
});

test("dm_send to human notifies onHumanDm with that humanId", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  const seen: { humanId: string; text: string; threadId: string }[] = [];
  await dispatchChannelPost({
    store,
    workspace,
    provider: new ScriptedProvider([
      [
        {
          type: "tool-call",
          id: "d1",
          name: "dm_send",
          arguments: JSON.stringify({ to: "human", text: "need the hero copy" }),
        },
        { type: "done" },
      ],
      [{ type: "text-delta", text: "I pinged you in DM" }, { type: "done" }],
    ]),
    tools: [],
    nextId: seq(),
    now: () => "t",
    channelId: "landing",
    text: "@coder go",
    humanId: "arda",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
    onHumanDm: async (row) => {
      seen.push(row);
    },
  });
  expect(seen).toEqual([
    { humanId: "arda", text: "need the hero copy", threadId: "user__arda__coder" },
  ]);
});

test("dm_send to human opens human__bot and does not run a DM turn", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  const provider = new ScriptedProvider([
    [
      {
        type: "tool-call",
        id: "d1",
        name: "dm_send",
        arguments: JSON.stringify({ to: "human", text: "need the hero copy" }),
      },
      { type: "done" },
    ],
    [{ type: "text-delta", text: "I pinged you in DM" }, { type: "done" }],
  ]);
  const result = await dispatchChannelPost({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    channelId: "landing",
    text: "@coder go",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(result.dms).toEqual([]);
  const dm = store.read({ kind: "dm", id: "human__coder" });
  expect(dm.some((e) => e.type === "dm.opened")).toBe(true);
  expect(
    dm.filter((e) => e.type === "message.posted").map((e) => e.payload.text),
  ).toContain("need the hero copy");
});

test("shouldStop drops remaining waves", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "lead", name: "Lead" });
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead", "coder"],
    permissionMode: "auto-accept",
  });
  let waves = 0;
  const provider: Provider = {
    async *complete() {
      waves += 1;
      yield { type: "text-delta" as const, text: waves === 1 ? "@coder go" : "coder here" };
      yield { type: "done" as const };
    },
  };
  let seen = 0;
  const result = await dispatchChannelPost({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    channelId: "landing",
    text: "kick",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
    shouldStop: () => {
      seen += 1;
      return seen > 1;
    },
  });
  expect(result.replies.map((r) => r.botId)).toEqual(["lead"]);
});

test("lead handoff still runs; a 429 on that wave is returned", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "lead", name: "Lead" });
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addBot({ id: "designer", name: "Designer" });
  workspace.addChannel({
    id: "landing",
    leadBotId: "lead",
    memberBotIds: ["lead", "coder", "designer"],
    permissionMode: "auto-accept",
  });
  const provider = new ScriptedProvider([
    [{ type: "text-delta", text: "@designer next" }, { type: "done" }],
    [{ type: "error", message: "429 rate-limited" }, { type: "done" }],
  ]);
  const result = await dispatchChannelPost({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    channelId: "landing",
    text: "kick off",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
  });
  expect(result.replies.some((r) => r.error?.includes("429"))).toBe(true);
  expect(result.replies[0]?.botId).toBe("lead");
});
