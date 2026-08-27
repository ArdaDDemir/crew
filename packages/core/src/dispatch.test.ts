import { expect, test } from "bun:test";
import { MemoryEventStore } from "./store";
import { MemoryWorkspace } from "./workspace";
import { ScriptedProvider } from "./provider";
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
