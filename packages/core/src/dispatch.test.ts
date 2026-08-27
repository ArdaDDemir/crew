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

test("waits rateLimitGapMs before the next wave after a 429", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "lead", name: "Lead" });
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addBot({ id: "designer", name: "Designer" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["lead", "coder", "designer"],
    permissionMode: "auto-accept",
  });
  const slept: number[] = [];
  const provider = new ScriptedProvider([
    [{ type: "text-delta", text: "@designer next" }, { type: "done" }],
    [{ type: "error", message: "429 rate-limited" }, { type: "done" }],
    [{ type: "text-delta", text: "ok" }, { type: "done" }],
  ]);
  const result = await dispatchChannelPost({
    store,
    workspace,
    provider,
    tools: [],
    nextId: seq(),
    now: () => "t",
    channelId: "landing",
    text: "@lead @coder",
    model: "test",
    workspaceRoot: "/proj",
    ask: async () => "allow",
    hasReviewer: false,
    sleep: async (ms) => {
      slept.push(ms);
    },
    rateLimitGapMs: 12000,
  });
  expect(slept).toEqual([12000]);
  expect(result.replies.some((r) => r.error?.includes("429"))).toBe(true);
  expect(result.replies.some((r) => r.text === "ok")).toBe(true);
});
