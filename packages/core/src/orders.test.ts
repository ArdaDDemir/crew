import { expect, test } from "bun:test";
import { MemoryEventStore } from "./store";
import { MemoryWorkspace } from "./workspace";
import { buildCrossThreadNote, collectHumanOrders } from "./orders";
import type { CrewEvent, ThreadRef } from "./events";

function evt(
  id: string,
  ts: string,
  thread: ThreadRef,
  type: string,
  payload: Record<string, unknown>,
): CrewEvent {
  return { v: 1, id, ts, thread, type, parent: null, payload };
}

function setup() {
  const store = new MemoryEventStore();
  const workspace = new MemoryWorkspace();
  workspace.addBot({ id: "coder", name: "Coder" });
  workspace.addBot({ id: "designer", name: "Designer" });
  workspace.addChannel({
    id: "landing",
    memberBotIds: ["coder", "designer"],
    permissionMode: "auto-accept",
  });
  return { store, workspace };
}

test("latest human DM beats an older channel order", () => {
  const { store, workspace } = setup();
  const channel = { kind: "channel" as const, id: "landing" };
  const dm = { kind: "dm" as const, id: "human__coder" };
  store.append(
    evt("1", "2026-08-27T15:00:00.000Z", channel, "message.posted", {
      author: { kind: "human" },
      text: "Set the title to FlowHub",
    }),
  );
  store.append(
    evt("2", "2026-08-27T15:05:00.000Z", dm, "dm.opened", {
      participants: [{ kind: "human" }, { kind: "bot", botId: "coder" }],
    }),
  );
  store.append(
    evt("3", "2026-08-27T15:06:00.000Z", dm, "message.posted", {
      author: { kind: "human" },
      text: "Do not change index.html. Title stays Landing.",
    }),
  );

  const orders = collectHumanOrders(store, workspace, "coder");
  expect(orders.at(-1)?.text).toContain("Title stays Landing");

  const note = buildCrossThreadNote({
    store,
    workspace,
    botId: "coder",
    thread: channel,
  });
  expect(note).toContain("wins");
  expect(note).toContain("Title stays Landing");
  expect(note).toContain("human__coder");
  expect(note).not.toContain("Set the title to FlowHub");
});

test("DM turn sees last channel account and a newer channel human order", () => {
  const { store, workspace } = setup();
  const channel = { kind: "channel" as const, id: "landing" };
  const dm = { kind: "dm" as const, id: "human__coder" };
  store.append(
    evt("1", "2026-08-27T15:00:00.000Z", dm, "dm.opened", {
      participants: [{ kind: "human" }, { kind: "bot", botId: "coder" }],
    }),
  );
  store.append(
    evt("2", "2026-08-27T15:01:00.000Z", dm, "message.posted", {
      author: { kind: "human" },
      text: "Never touch the file",
    }),
  );
  store.append(
    evt("3", "2026-08-27T15:02:00.000Z", channel, "message.posted", {
      author: { kind: "human" },
      text: "Set title to FlowHub @coder",
    }),
  );
  store.append(
    evt("4", "2026-08-27T15:03:00.000Z", channel, "message.posted", {
      author: { kind: "bot", botId: "coder" },
      text: "I set the title to FlowHub",
    }),
  );

  const note = buildCrossThreadNote({
    store,
    workspace,
    botId: "coder",
    thread: dm,
  });
  expect(note).toContain("Set title to FlowHub");
  expect(note).toContain("wins");
  expect(note).toContain("I set the title to FlowHub");
});

test("no note when the bot has only this thread", () => {
  const { store, workspace } = setup();
  const channel = { kind: "channel" as const, id: "landing" };
  store.append(
    evt("1", "2026-08-27T15:00:00.000Z", channel, "message.posted", {
      author: { kind: "human" },
      text: "hello @coder",
    }),
  );
  expect(
    buildCrossThreadNote({
      store,
      workspace,
      botId: "coder",
      thread: channel,
    }),
  ).toBeUndefined();
});
