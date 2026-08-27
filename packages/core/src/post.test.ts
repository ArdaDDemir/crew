import { expect, test } from "bun:test";
import { MemoryEventStore } from "./store";
import { MemoryWorkspace } from "./workspace";
import { postToChannel, postToDm } from "./post";

function seq(prefix: string) {
  let n = 0;
  return () => `${prefix}_${++n}`;
}

function landingWorkspace() {
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
  return workspace;
}

test("human @designer @coder posts one message and wakes both, not tester", async () => {
  const store = new MemoryEventStore();
  const workspace = landingWorkspace();
  const result = await postToChannel({
    store,
    workspace,
    nextId: seq("evt"),
    now: () => "2026-08-27T12:00:00.000Z",
    channelId: "landing",
    post: { author: { kind: "human" }, text: "@designer hero yaz @coder api kur" },
  });

  expect(result.woken).toEqual(["designer", "coder"]);
  const events = store.read({ kind: "channel", id: "landing" });
  expect(events.map((e) => e.type)).toEqual([
    "message.posted",
    "bot.woken",
    "bot.woken",
  ]);
  expect(events[0]).toMatchObject({
    v: 1,
    id: "evt_1",
    ts: "2026-08-27T12:00:00.000Z",
    thread: { kind: "channel", id: "landing" },
    type: "message.posted",
    parent: null,
    payload: {
      author: { kind: "human" },
      text: "@designer hero yaz @coder api kur",
      mentions: ["designer", "coder"],
    },
  });
  expect(events[1].payload).toEqual({ botId: "designer", reason: "mention" });
  expect(events[2].payload).toEqual({ botId: "coder", reason: "mention" });
});

test("human post with no mention wakes the lead", async () => {
  const store = new MemoryEventStore();
  const result = await postToChannel({
    store,
    workspace: landingWorkspace(),
    nextId: seq("evt"),
    now: () => "2026-08-27T12:00:00.000Z",
    channelId: "landing",
    post: { author: { kind: "human" }, text: "landing sayfasını çıkar" },
  });
  expect(result.woken).toEqual(["lead"]);
  const woken = store
    .read({ kind: "channel", id: "landing" })
    .filter((e) => e.type === "bot.woken");
  expect(woken[0]?.payload).toEqual({ botId: "lead", reason: "lead" });
});

test("unknown channel throws", async () => {
  await expect(
    postToChannel({
      store: new MemoryEventStore(),
      workspace: landingWorkspace(),
      nextId: seq("evt"),
      now: () => "2026-08-27T12:00:00.000Z",
      channelId: "nope",
      post: { author: { kind: "human" }, text: "hi" },
    }),
  ).rejects.toThrow("unknown channel: nope");
});

test("bot-to-bot DM opens thread, posts, wakes the other bot", async () => {
  const store = new MemoryEventStore();
  const result = await postToDm({
    store,
    nextId: seq("evt"),
    now: () => "2026-08-27T12:00:00.000Z",
    from: { kind: "bot", botId: "lead" },
    to: { kind: "bot", botId: "designer" },
    text: "hero spec attached",
  });

  expect(result.threadId).toEqual("designer__lead");
  expect(result.woken).toEqual(["designer"]);
  const events = store.read({ kind: "dm", id: "designer__lead" });
  expect(events.map((e) => e.type)).toEqual([
    "dm.opened",
    "message.posted",
    "bot.woken",
  ]);
});

test("second DM message does not emit dm.opened again", async () => {
  const store = new MemoryEventStore();
  const deps = {
    store,
    nextId: seq("evt"),
    now: () => "2026-08-27T12:00:00.000Z",
    from: { kind: "bot" as const, botId: "lead" },
    to: { kind: "bot" as const, botId: "designer" },
  };
  await postToDm({ ...deps, text: "first" });
  await postToDm({ ...deps, text: "second" });
  const types = store.read({ kind: "dm", id: "designer__lead" }).map((e) => e.type);
  expect(types.filter((t) => t === "dm.opened")).toHaveLength(1);
  expect(types.filter((t) => t === "message.posted")).toHaveLength(2);
});

test("human-bot DM thread id is human__<bot>", async () => {
  const store = new MemoryEventStore();
  const result = await postToDm({
    store,
    nextId: seq("evt"),
    now: () => "2026-08-27T12:00:00.000Z",
    from: { kind: "human" },
    to: { kind: "bot", botId: "coder" },
    text: "fix login",
  });
  expect(result.threadId).toEqual("human__coder");
  expect(result.woken).toEqual(["coder"]);
});
