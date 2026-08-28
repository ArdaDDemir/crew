import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAlways, matchesAlways, ScriptedProvider, type Provider } from "@crew/core";
import {
  checkHostUpdate,
  createChannel,
  createHost,
  openDmChat,
  readThread,
  resolveAsk,
  sayChannel,
  setMode,
  setUpdateUrl,
  snapshot,
  threadDiff,
} from "./host";
import { fakeMcpRpc } from "./mcp-client";
import { saveMcp } from "./mcp";
import { writeConfigFile, projectConfigPath } from "./config";
import { loadJobs, resolveJobModel, saveJobs } from "./jobs";
import { defaultProviders, loadProviders, saveProviders } from "./providers";

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

test("readThread surfaces handoff.held as a status row", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const host = createHost({ cwd, provider: new ScriptedProvider([]) });
  host.store.append({
    v: 1,
    id: "e1",
    ts: "t",
    thread: { kind: "channel", id: "landing" },
    type: "handoff.held",
    parent: null,
    payload: {
      waiting: ["coder"],
      text: "@coder was mentioned and will wait for your next message.",
    },
  });
  const rows = readThread(host, "channel", "landing", { thinking: false, verbose: false });
  const held = rows.find((r) => r && r.type === "held") as { text: string; waiting: string[] };
  expect(held.text).toContain("@coder");
  expect(held.waiting).toEqual(["coder"]);
});

test("loadJobs missing file returns empty-model defaults", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const host = createHost({ cwd, provider: new ScriptedProvider([]) });
  expect(existsSync(join(cwd, ".crew", "jobs.json"))).toBe(false);
  expect(loadJobs(host)).toEqual({
    title: { model: "", botId: null, harness: null, harnessModel: null },
    compact: { model: "", botId: null, harness: null, harnessModel: null },
    vision: { model: "", botId: null, harness: null, harnessModel: null },
    read: { model: "", botId: null, harness: null, harnessModel: null },
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

test("Grok harness person turn spawns grok, not OpenRouter", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const argvLog: string[][] = [];
  const host = createHost({
    cwd,
    provider: new ScriptedProvider([
      [{ type: "error", message: "openrouter should not run" }, { type: "done" }],
    ]),
    grokRun: async function* (argv) {
      argvLog.push(argv);
      yield '{"type":"text","data":"I listed the files."}';
      return 0;
    },
  });
  saveProviders(cwd, { ...defaultProviders(), grok: { enabled: true, binary: "grok" } });
  host.workspace.addBot({
    id: "coder",
    name: "Coder",
    harness: "grok",
    harnessModel: "grok-4.6",
    model: "z-ai/glm-5.3-flash",
  });
  createChannel(host, { id: "landing", memberBotIds: ["coder"], leadBotId: "coder" });
  const result = await sayChannel(host, "landing", "@coder list files");
  expect(result.replies.map((r) => `${r.botId}:${r.text}`)).toEqual(["coder:I listed the files."]);
  expect(result.replies[0]?.error).toBeUndefined();
  expect(argvLog[0]?.includes("--prompt-file")).toBe(true);
  expect(argvLog[0]?.includes("grok-4.6")).toBe(true);
  expect(argvLog[0]?.includes("acceptEdits") || argvLog[0]?.includes("--always-approve")).toBe(true);
});

test("Claude Codex OpenCode harness turns spawn those CLIs", async () => {
  const cases = [
    {
      kind: "claude" as const,
      line: '{"type":"assistant","message":{"content":[{"type":"text","text":"claude account"}]}}',
      flag: "-p",
      model: "sonnet",
    },
    {
      kind: "codex" as const,
      line: '{"type":"item.completed","item":{"type":"agentMessage","text":"codex account"}}',
      flag: "exec",
      model: "gpt-5.6-sol",
    },
    {
      kind: "opencode" as const,
      line: '{"type":"text","part":{"text":"opencode account"}}',
      flag: "run",
      model: "",
    },
  ];
  for (const row of cases) {
    const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
    const argvLog: string[][] = [];
    const host = createHost({
      cwd,
      provider: new ScriptedProvider([
        [{ type: "error", message: "openrouter should not run" }, { type: "done" }],
      ]),
      harnessRun: async function* (argv) {
        argvLog.push(argv);
        yield row.line;
        return 0;
      },
    });
    saveProviders(cwd, {
      ...defaultProviders(),
      [row.kind]: { enabled: true, binary: row.kind },
    });
    host.workspace.addBot({
      id: "coder",
      name: "Coder",
      harness: row.kind,
      harnessModel: row.model || null,
      model: "z-ai/glm-5.3-flash",
    });
    createChannel(host, { id: "landing", memberBotIds: ["coder"], leadBotId: "coder" });
    const result = await sayChannel(host, "landing", "@coder go");
    expect(result.replies[0]?.text).toBe(`${row.kind} account`);
    expect(result.replies[0]?.error).toBeUndefined();
    expect(argvLog[0]?.includes(row.flag)).toBe(true);
  }
});

test("Crew-native turn can call an MCP echo tool", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const host = createHost({
    cwd,
    provider: new ScriptedProvider([
      [
        { type: "tool-call", id: "c1", name: "mcp_echo_echo", arguments: "{\"text\":\"hi\"}" },
        { type: "done" },
      ],
      [{ type: "text-delta", text: "I used echo." }, { type: "done" }],
    ]),
    mcpConnect: () =>
      fakeMcpRpc({
        tools: [
          {
            name: "echo",
            description: "Echo",
            inputSchema: { type: "object", properties: { text: { type: "string" } } },
          },
        ],
        call: async (_name, args) => ({ content: [{ type: "text", text: String(args.text ?? "") }] }),
      }),
  });
  saveMcp(cwd, {
    servers: [{ name: "echo", enabled: true, command: "fake", args: [], env: {} }],
  });
  host.workspace.addBot({ id: "coder", name: "Coder" });
  createChannel(host, { id: "landing", memberBotIds: ["coder"], leadBotId: "coder" });
  const result = await sayChannel(host, "landing", "@coder ping");
  expect(result.replies[0]?.text).toBe("I used echo.");
  expect(result.replies[0]?.error).toBeUndefined();
  const events = host.store.read({ kind: "channel", id: "landing" });
  const done = events.find((e) => e.type === "tool.completed");
  expect(String(done?.payload.output ?? "")).toBe("hi");
});

test("supervised channel does not spawn Grok", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  let grokCalls = 0;
  const host = createHost({
    cwd,
    provider: new ScriptedProvider([[{ type: "text-delta", text: "crew asked" }, { type: "done" }]]),
    grokRun: async function* () {
      grokCalls += 1;
      yield '{"type":"text","data":"grok should not run"}';
      return 0;
    },
  });
  saveProviders(cwd, { ...defaultProviders(), grok: { enabled: true, binary: "grok" } });
  host.workspace.addBot({ id: "coder", name: "Coder", harness: "grok", harnessModel: "grok-4.6" });
  createChannel(host, {
    id: "landing",
    memberBotIds: ["coder"],
    leadBotId: "coder",
    permissionMode: "supervised",
  });
  const result = await sayChannel(host, "landing", "@coder hi");
  expect(grokCalls).toBe(0);
  expect(result.replies[0]?.text).toBe("crew asked");
});

test("Grok harness off stays on OpenRouter", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  let grokCalls = 0;
  const host = createHost({
    cwd,
    provider: new ScriptedProvider([[{ type: "text-delta", text: "openrouter account" }, { type: "done" }]]),
    grokRun: async function* () {
      grokCalls += 1;
      yield '{"type":"text","data":"grok should not run"}';
      return 0;
    },
  });
  host.workspace.addBot({ id: "coder", name: "Coder", harness: "grok", harnessModel: "grok-4.6" });
  createChannel(host, { id: "landing", memberBotIds: ["coder"], leadBotId: "coder" });
  const result = await sayChannel(host, "landing", "@coder hi");
  expect(grokCalls).toBe(0);
  expect(result.replies[0]?.text).toBe("openrouter account");
});

test("createChannel uses workspace defaultPermissionMode when mode is omitted", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  writeConfigFile(projectConfigPath(cwd), { apiKey: "sk-test", defaultPermissionMode: "supervised" });
  const host = createHost({ cwd, provider: new ScriptedProvider([]) });
  host.workspace.addBot({ id: "lead", name: "Lead" });
  createChannel(host, { id: "lab" });
  expect(host.workspace.getChannel("lab")?.permissionMode).toBe("supervised");
});

test("saveProviders roundtrips and is not config.json", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const host = createHost({ cwd, provider: new ScriptedProvider([]) });
  expect(loadProviders(host.cwd)).toEqual(defaultProviders());
  const saved = saveProviders(host.cwd, {
    ...defaultProviders(),
    grok: { enabled: true, binary: "C:\\\\bin\\\\grok.exe" },
  });
  expect(saved.grok.enabled).toBe(true);
  expect(existsSync(join(cwd, ".crew", "providers.json"))).toBe(true);
  expect(existsSync(join(cwd, ".crew", "config.json"))).toBe(false);
  expect(loadProviders(host.cwd).grok.binary).toBe("C:\\\\bin\\\\grok.exe");
});

test("resolveJobModel ignores harness and uses OpenRouter", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const host = createHost({ cwd, provider: new ScriptedProvider([]) });
  const harnessSlot = {
    model: "",
    botId: null,
    harness: "grok",
    harnessModel: "grok-4.6",
  };
  expect(resolveJobModel(host, "title", harnessSlot)).toBe(host.model);
  expect(
    resolveJobModel(host, "title", {
      model: "openrouter/foo",
      botId: null,
      harness: "grok",
      harnessModel: "grok-4.6",
    }),
  ).toBe("openrouter/foo");
  expect(resolveJobModel(host, "vision", harnessSlot)).toBe(null);
  expect(resolveJobModel(host, "compact", harnessSlot)).toBe(host.model);
});

test("resolveJobModel compact/vision/read pick the agent's person model", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const host = createHost({ cwd, provider: new ScriptedProvider([]) });
  host.workspace.addBot({ id: "lead", name: "Lead", model: "person/compact" });
  host.workspace.addBot({ id: "seer", name: "Seer", model: "person/vision" });
  expect(resolveJobModel(host, "compact", { model: "", botId: null })).toBe(host.model);
  expect(resolveJobModel(host, "compact", { model: "", botId: "lead" })).toBe("person/compact");
  expect(resolveJobModel(host, "vision", { model: "", botId: null })).toBe(null);
  expect(resolveJobModel(host, "vision", { model: "", botId: "seer" })).toBe("person/vision");
  expect(resolveJobModel(host, "read", { model: "", botId: "lead" })).toBe("person/compact");
  expect(resolveJobModel(host, "title", { model: "title/cheap", botId: "lead" })).toBe("title/cheap");
  expect(resolveJobModel(host, "title", { model: "", botId: "lead" })).toBe(host.model);
});

test("updateUrl lives in user config and snapshot has version", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const home = await mkdtemp(join(tmpdir(), "crew-home-"));
  const host = createHost({ cwd, home, provider: new ScriptedProvider([]) });
  const snap = snapshot(host);
  expect(snap.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(snap.updateUrl).toBe("");
  expect(setUpdateUrl(host, "https://example.com/latest.json")).toEqual({
    updateUrl: "https://example.com/latest.json",
  });
  expect(JSON.parse(readFileSync(join(home, ".crew", "config.json"), "utf8")).updateUrl).toBe(
    "https://example.com/latest.json",
  );
  expect(existsSync(join(cwd, ".crew", "config.json"))).toBe(false);
  expect(() => setUpdateUrl(host, "http://evil.example/x")).toThrow();
});

test("checkHostUpdate uses injected fetch and does not hit the network", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  const home = await mkdtemp(join(tmpdir(), "crew-home-"));
  const host = createHost({ cwd, home, provider: new ScriptedProvider([]) });
  setUpdateUrl(host, "https://example.com/latest.json");
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ version: "9.0.0", notes: "n", url: "https://example.com/Crew.msi" }), {
      headers: { "Content-Type": "application/json" },
    });
  const got = await checkHostUpdate(host, fetchImpl);
  expect(got).toEqual({
    status: "available",
    version: "9.0.0",
    notes: "n",
    url: "https://example.com/Crew.msi",
  });
});

test("new DM stores workspace defaultPermissionMode; setMode updates it", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  writeConfigFile(projectConfigPath(cwd), { apiKey: "sk-test", defaultPermissionMode: "supervised" });
  const host = createHost({ cwd, provider: new ScriptedProvider([[{ type: "text-delta", text: "hi" }, { type: "done" }]]) });
  host.workspace.addBot({ id: "coder", name: "Coder" });
  const opened = openDmChat(host, "coder");
  expect(snapshot(host).dms.find((d) => d.id === opened.id)?.permissionMode).toBe("supervised");
  expect(setMode(host, opened.id, "full-access").mode).toBe("full-access");
  expect(snapshot(host).dms.find((d) => d.id === opened.id)?.permissionMode).toBe("full-access");
});

test("auto channel with reviewerModel calls that model before a patch", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-host-"));
  writeConfigFile(projectConfigPath(cwd), {
    apiKey: "sk-test",
    reviewerModel: "review/cheap",
  });
  const models: string[] = [];
  let round = 0;
  const provider: Provider = {
    async *complete(req) {
      models.push(req.model);
      if (req.model === "review/cheap") {
        yield { type: "text-delta", text: "ALLOW" };
        yield { type: "done" };
        return;
      }
      round += 1;
      if (round === 1) {
        yield {
          type: "tool-call",
          id: "c1",
          name: "apply_patch",
          arguments: JSON.stringify({ path: "n.ts", old_text: "", new_text: "hi" }),
        };
        yield { type: "done" };
        return;
      }
      yield { type: "text-delta", text: "patched" };
      yield { type: "done" };
    },
  };
  const host = createHost({ cwd, provider });
  host.workspace.addBot({ id: "coder", name: "Coder" });
  createChannel(host, {
    id: "lab",
    memberBotIds: ["coder"],
    leadBotId: "coder",
    permissionMode: "auto",
  });
  await sayChannel(host, "lab", "@coder patch n.ts");
  expect(models).toContain("review/cheap");
});
