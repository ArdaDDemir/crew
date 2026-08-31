import { dirname } from "node:path";
import { expect, test } from "bun:test";
import { DEFAULT_HARNESS_MODEL, HARNESS_KINDS, buildHarnessArgv } from "./argv";

test("every harness kind has a non-empty default model", () => {
  for (const kind of HARNESS_KINDS) {
    expect(DEFAULT_HARNESS_MODEL[kind].trim()).not.toBe("");
  }
});

test("claude argv is print + stream-json + bypass permissions", () => {
  const argv = buildHarnessArgv({
    kind: "claude",
    binary: "claude",
    cwd: "/proj",
    promptFile: "/tmp/p.txt",
    model: "sonnet",
    mode: "full-access",
  });
  expect(argv[0]).toBe("claude");
  expect(argv).toContain("-p");
  expect(argv).toContain("stream-json");
  expect(argv).toContain("bypassPermissions");
  expect(argv).toContain("--add-dir");
  expect(argv).toContain(dirname("/tmp/p.txt"));
  expect(argv).toContain("-m");
  expect(argv).toContain("sonnet");
});

test("auto-accept maps to acceptEdits / workspace-write, not bypass", () => {
  const claude = buildHarnessArgv({
    kind: "claude",
    binary: "claude",
    cwd: "/p",
    promptFile: "/tmp/p.txt",
    mode: "auto-accept",
  });
  expect(claude).toContain("acceptEdits");
  expect(claude).not.toContain("bypassPermissions");
  const grok = buildHarnessArgv({
    kind: "grok",
    binary: "grok",
    cwd: "/p",
    promptFile: "/tmp/p.txt",
    mode: "auto-accept",
  });
  expect(grok).toContain("acceptEdits");
  expect(grok).not.toContain("--always-approve");
  const all = ["claude", "codex", "grok", "opencode"] as const;
  for (const kind of all) {
    const argv = buildHarnessArgv({
      kind,
      binary: kind,
      cwd: "/p",
      promptFile: "/tmp/p.txt",
      mode: "full-access",
    });
    expect(argv.join(" ")).toMatch(/\.env|ssh|Never read or write \.env/);
  }
});

test("mcp-config path is forwarded", () => {
  const argv = buildHarnessArgv({
    kind: "claude",
    binary: "claude",
    cwd: "/p",
    promptFile: "/tmp/p.txt",
    mode: "auto-accept",
    mcpConfigPath: "/tmp/mcp.json",
  });
  expect(argv).toContain("--mcp-config");
  expect(argv).toContain("/tmp/mcp.json");
});

test("codex argv is exec json workspace-write", () => {
  const argv = buildHarnessArgv({
    kind: "codex",
    binary: "codex",
    cwd: "/proj",
    promptFile: "/tmp/p.txt",
    model: "gpt-5.6-sol",
  });
  expect(argv.slice(0, 2)).toEqual(["codex", "exec"]);
  expect(argv).toContain("--json");
  expect(argv).toContain("workspace-write");
  expect(argv).toContain("-C");
  expect(argv).toContain("/proj");
  expect(argv).toContain("gpt-5.6-sol");
});

test("opencode argv is run json auto with prompt file", () => {
  const argv = buildHarnessArgv({
    kind: "opencode",
    binary: "opencode",
    cwd: "/proj",
    promptFile: "/tmp/p.txt",
    model: "opencode/gpt",
  });
  expect(argv.slice(0, 2)).toEqual(["opencode", "run"]);
  expect(argv).toContain("--format");
  expect(argv).toContain("json");
  expect(argv).toContain("--auto");
  expect(argv).toContain("--file");
  expect(argv).toContain("/tmp/p.txt");
  expect(argv).toContain("--dir");
  expect(argv).toContain("/proj");
});

test("opencode argv keeps the message positional even without a model", () => {
  const argv = buildHarnessArgv({
    kind: "opencode",
    binary: "opencode",
    cwd: "/proj",
    promptFile: "/tmp/p.txt",
  });
  const fileAt = argv.indexOf("--file");
  const messageAt = argv.findIndex((a) => a.startsWith("Follow the attached Crew brief"));
  expect(fileAt).toBeGreaterThan(-1);
  expect(messageAt).toBeGreaterThan(-1);
  expect(messageAt).toBeLessThan(fileAt);
});

test("opencode argv keeps the message positional with a model flag", () => {
  const argv = buildHarnessArgv({
    kind: "opencode",
    binary: "opencode",
    cwd: "/proj",
    promptFile: "/tmp/p.txt",
    model: "openrouter/z-ai/glm-5.3-flash",
  });
  const fileAt = argv.indexOf("--file");
  const modelAt = argv.indexOf("-m");
  const messageAt = argv.findIndex((a) => a.startsWith("Follow the attached Crew brief"));
  expect(fileAt).toBeGreaterThan(-1);
  expect(modelAt).toBeGreaterThan(-1);
  expect(messageAt).toBeGreaterThan(-1);
  expect(messageAt).toBeLessThan(fileAt);
  expect(messageAt).toBeLessThan(modelAt);
});

test("opencode argv passes reasoning effort as --variant", () => {
  const withEffort = buildHarnessArgv({
    kind: "opencode",
    binary: "opencode",
    cwd: "/proj",
    promptFile: "/tmp/p.txt",
    model: "opencode-go/glm-5.3-flash",
    effort: "max",
  });
  expect(withEffort).toContain("--variant");
  expect(withEffort).toContain("max");
  const without = buildHarnessArgv({
    kind: "opencode",
    binary: "opencode",
    cwd: "/proj",
    promptFile: "/tmp/p.txt",
    model: "opencode-go/glm-5.3-flash",
  });
  expect(without).not.toContain("--variant");
});
