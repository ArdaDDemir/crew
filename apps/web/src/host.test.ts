import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAlways, matchesAlways, ScriptedProvider } from "@crew/core";
import { createHost, readThread, resolveAsk, threadDiff } from "./host";
import { loadJobs, saveJobs } from "./jobs";

test("resolveAsk always persists the fingerprint", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const host = createHost({ cwd, provider: new ScriptedProvider([]) });
  let decided = "";
  host.run = {
    stopped: false,
    askTool: "apply_patch",
    askArgs: { path: "src/a.ts" },
    resolveAsk: (d) => {
      decided = d;
    },
  };
  resolveAsk(host, "always", { tool: "apply_patch", args: { path: "src/a.ts" } });
  expect(decided).toBe("always");
  expect(matchesAlways(loadAlways(join(cwd, ".crew")), "apply_patch", { path: "src/a.ts" })).toBe(
    true,
  );
  expect(matchesAlways(loadAlways(join(cwd, ".crew")), "apply_patch", { path: "src/b.ts" })).toBe(
    false,
  );
});

test("threadDiff prefers a file path and truncates huge shell commands", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const host = createHost({ cwd, provider: new ScriptedProvider([]) });
  const dump = `cat > index.html << 'EOF'\n${"!".repeat(800)}\nEOF`;
  host.store.append({
    v: 1,
    id: "t1",
    ts: "t",
    thread: { kind: "channel", id: "landing" },
    type: "tool.requested",
    parent: null,
    payload: { name: "shell", args: { command: dump }, botId: "coder" },
  });
  host.store.append({
    v: 1,
    id: "t2",
    ts: "t",
    thread: { kind: "channel", id: "landing" },
    type: "tool.requested",
    parent: null,
    payload: { name: "read", args: { path: "index.html" }, botId: "lead" },
  });
  const diff = threadDiff(host, "channel", "landing");
  expect(diff.some((d) => d.path === "index.html")).toBe(true);
  expect(diff.every((d) => d.path.length < 80)).toBe(true);
  expect(JSON.stringify(diff)).not.toContain("!!!!");
});

test("threadDiff includes a unified snippet from apply_patch args", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const host = createHost({ cwd, provider: new ScriptedProvider([]) });
  host.store.append({
    v: 1,
    id: "t1",
    ts: "t",
    thread: { kind: "channel", id: "landing" },
    type: "tool.requested",
    parent: null,
    payload: {
      name: "apply_patch",
      args: { path: "a.txt", old_text: "hello", new_text: "hi" },
      botId: "coder",
    },
  });
  const diff = threadDiff(host, "channel", "landing");
  const row = diff.find((d) => d.path === "a.txt");
  expect(row?.tool).toBe("apply_patch");
  expect(row?.snippet).toContain("-hello");
  expect(row?.snippet).toContain("+hi");
});

test("threadDiff last apply_patch for a path wins the snippet", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const host = createHost({ cwd, provider: new ScriptedProvider([]) });
  host.store.append({
    v: 1,
    id: "t1",
    ts: "t1",
    thread: { kind: "channel", id: "landing" },
    type: "tool.requested",
    parent: null,
    payload: { name: "read", args: { path: "a.txt" }, botId: "lead" },
  });
  host.store.append({
    v: 1,
    id: "t2",
    ts: "t2",
    thread: { kind: "channel", id: "landing" },
    type: "tool.requested",
    parent: null,
    payload: {
      name: "apply_patch",
      args: { path: "a.txt", old_text: "hello", new_text: "hi" },
      botId: "coder",
    },
  });
  host.store.append({
    v: 1,
    id: "t3",
    ts: "t3",
    thread: { kind: "channel", id: "landing" },
    type: "tool.requested",
    parent: null,
    payload: {
      name: "apply_patch",
      args: { path: "a.txt", old_text: "hi", new_text: "hey" },
      botId: "coder",
    },
  });
  const diff = threadDiff(host, "channel", "landing");
  const rows = diff.filter((d) => d.path === "a.txt");
  expect(rows).toHaveLength(1);
  expect(rows[0]?.tool).toBe("apply_patch");
  expect(rows[0]?.snippet).toContain("-hi");
  expect(rows[0]?.snippet).toContain("+hey");
  expect(rows[0]?.snippet).not.toContain("-hello");
});

test("readThread shortens stored 429 JSON", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const host = createHost({ cwd, provider: new ScriptedProvider([]) });
  host.store.append({
    v: 1,
    id: "e1",
    ts: "t",
    thread: { kind: "channel", id: "landing" },
    type: "error",
    parent: null,
    payload: {
      botId: "lead",
      message:
        'provider 429: {"error":{"message":"Provider returned error","code":429,"metadata":{"provider_name":"Decart"},"user_id":"user_secret"}}',
    },
  });
  const rows = readThread(host, "channel", "landing", { thinking: false, verbose: false });
  const err = rows.find((r) => r && r.type === "error") as { text: string };
  expect(err.text).toContain("429");
  expect(err.text).not.toContain("user_secret");
  expect(err.text).not.toContain("{");
});

test("loadJobs missing file returns empty-model defaults", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const host = createHost({ cwd, provider: new ScriptedProvider([]) });
  expect(existsSync(join(cwd, ".crew", "jobs.json"))).toBe(false);
  expect(loadJobs(host)).toEqual({
    title: { model: "", botId: null },
    compact: { model: "", botId: null },
    vision: { model: "", botId: null },
    read: { model: "", botId: null },
  });
});

test("saveJobs roundtrips pretty JSON and does not write config.json", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const host = createHost({ cwd, provider: new ScriptedProvider([]) });
  const saved = saveJobs(host, {
    title: { model: "z-ai/glm-5.3-flash", botId: null },
    compact: { model: "openai/gpt-4o-mini", botId: "lead" },
    vision: { model: "", botId: null },
    read: { model: "", botId: null },
  });
  expect(saved.compact.model).toBe("openai/gpt-4o-mini");
  expect(saved.compact.botId).toBe("lead");
  const raw = readFileSync(join(cwd, ".crew", "jobs.json"), "utf8");
  expect(raw.endsWith("\n")).toBe(true);
  expect(raw).toContain("\n  ");
  expect(JSON.parse(raw)).toEqual(saved);
  expect(loadJobs(host)).toEqual(saved);
  expect(existsSync(join(cwd, ".crew", "config.json"))).toBe(false);
});
