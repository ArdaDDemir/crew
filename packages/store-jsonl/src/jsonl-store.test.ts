import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CrewEvent } from "@crew/core";
import { JsonlEventStore } from "./jsonl-store";

function evt(id: string, thread: CrewEvent["thread"], type: string): CrewEvent {
  return {
    v: 1,
    id,
    ts: "2026-08-27T12:00:00.000Z",
    thread,
    type,
    parent: null,
    payload: { id },
  };
}

test("appends JSONL and reads it back without rewriting earlier lines", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-jsonl-"));
  const store = new JsonlEventStore(dir);
  const thread = { kind: "channel" as const, id: "landing" };

  store.append(evt("evt_1", thread, "message.posted"));
  const first = await readFile(join(dir, "channel-landing.jsonl"), "utf8");
  store.append(evt("evt_2", thread, "bot.woken"));
  const second = await readFile(join(dir, "channel-landing.jsonl"), "utf8");

  expect(second.startsWith(first)).toBe(true);
  expect(store.read(thread).map((e) => e.id)).toEqual(["evt_1", "evt_2"]);
});

test("DM logs use dm-<threadId>.jsonl", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-jsonl-"));
  const store = new JsonlEventStore(dir);
  const thread = { kind: "dm" as const, id: "designer__lead" };
  store.append(evt("evt_1", thread, "dm.opened"));
  const text = await readFile(join(dir, "dm-designer__lead.jsonl"), "utf8");
  expect(JSON.parse(text.trim()).id).toEqual("evt_1");
});

test("unknown thread reads as empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-jsonl-"));
  const store = new JsonlEventStore(dir);
  expect(store.read({ kind: "channel", id: "missing" })).toEqual([]);
});
