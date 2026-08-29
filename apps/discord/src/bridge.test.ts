import { expect, test } from "bun:test";
import { MemoryEventStore } from "@crew/core";
import { MemoryWorkspace } from "@crew/core";
import { ScriptedProvider } from "@crew/core";
import { dispatchChannelPost } from "@crew/core";
import { parseDiscordConfig } from "./config";
import { handleDiscordInbound } from "./bridge";

function seq() {
  let n = 0;
  return () => `evt_${++n}`;
}

test("mapped @coder say wakes coder and webhooks as Coder", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder"],
    permissionMode: "auto-accept",
  });
  const hooks: { username: string; content: string }[] = [];
  const system: string[] = [];
  const cfg = parseDiscordConfig({
    guildId: "g1",
    channels: { "111": "landing" },
    humans: { "222": "arda" },
  });
  const result = await handleDiscordInbound({
    cfg,
    msg: {
      guildId: "g1",
      channelId: "111",
      authorId: "222",
      content: "@coder ship the hero",
    },
    say: (channelId, text, humanId) =>
      dispatchChannelPost({
        store,
        workspace,
        provider: new ScriptedProvider([
          [{ type: "text-delta", text: "hero is in index.html" }, { type: "done" }],
        ]),
        tools: [],
        nextId: seq(),
        now: () => "t",
        channelId,
        text,
        humanId,
        model: "test",
        workspaceRoot: "/proj",
        ask: async () => "allow",
        hasReviewer: false,
      }),
    botName: (id) => workspace.getBot(id)?.name ?? id,
    postWebhook: async (row) => {
      hooks.push(row);
    },
    postSystem: async (text) => {
      system.push(text);
    },
  });
  expect(result.ignore).toBeUndefined();
  expect(hooks).toEqual([{ username: "Coder", content: "hero is in index.html" }]);
  expect(system).toEqual([]);
  const posted = store
    .read({ kind: "channel", id: "landing" })
    .find((e) => e.type === "message.posted");
  expect(posted?.payload.author).toEqual({ kind: "human", humanId: "arda" });
});

test("Discord DM wakes dmBotId and replies via postDm not webhook", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  const hooks: { username: string; content: string }[] = [];
  const dms: string[] = [];
  const cfg = parseDiscordConfig({
    guildId: "g1",
    humans: { "222": "arda" },
    dmBotId: "coder",
  });
  const { dispatchDm, humanAuthor } = await import("@crew/core");
  const result = await handleDiscordInbound({
    cfg,
    msg: {
      channelId: "dmchan",
      authorId: "222",
      content: "fix login",
    },
    say: async () => ({ replies: [] }),
    dm: async (botId, text, humanId) =>
      dispatchDm({
        store,
        workspace,
        provider: new ScriptedProvider([
          [{ type: "text-delta", text: "I will fix login" }, { type: "done" }],
        ]),
        tools: [],
        nextId: seq(),
        now: () => "t",
        from: humanAuthor(humanId),
        to: { kind: "bot", botId },
        text,
        model: "test",
        workspaceRoot: "/proj",
        ask: async () => "allow",
        hasReviewer: false,
      }),
    botName: (id) => workspace.getBot(id)?.name ?? id,
    postWebhook: async (row) => {
      hooks.push(row);
    },
    postSystem: async () => {},
    postDm: async (text) => {
      dms.push(text);
    },
  });
  expect(result.ignore).toBeUndefined();
  expect(hooks).toEqual([]);
  expect(dms).toEqual(["I will fix login"]);
  expect(
    store.read({ kind: "dm", id: "user__arda__coder" }).some((e) => e.type === "message.posted"),
  ).toBe(true);
});

test("held and ignored post as system, not as a person webhook", async () => {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "designer", name: "Designer" });
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["designer", "coder"],
    permissionMode: "auto-accept",
  });
  const hooks: { username: string; content: string }[] = [];
  const system: string[] = [];
  const cfg = parseDiscordConfig({
    guildId: "g1",
    channels: { "111": "landing" },
    humans: { "222": "arda" },
  });
  await handleDiscordInbound({
    cfg,
    msg: {
      guildId: "g1",
      channelId: "111",
      authorId: "222",
      content: "@designer hero @ghost",
    },
    say: (channelId, text, humanId) =>
      dispatchChannelPost({
        store,
        workspace,
        provider: new ScriptedProvider([
          [
            { type: "text-delta", text: "hero done @coder put this in index.html" },
            { type: "done" },
          ],
        ]),
        tools: [],
        nextId: seq(),
        now: () => "t",
        channelId,
        text,
        humanId,
        model: "test",
        workspaceRoot: "/proj",
        ask: async () => "allow",
        hasReviewer: false,
      }),
    botName: (id) => workspace.getBot(id)?.name ?? id,
    postWebhook: async (row) => {
      hooks.push(row);
    },
    postSystem: async (text) => {
      system.push(text);
    },
  });
  expect(hooks.map((h) => h.username)).toEqual(["Designer"]);
  expect(system.join("\n")).toMatch(/@ghost/i);
  expect(system.join("\n")).toMatch(/@coder/i);
});
