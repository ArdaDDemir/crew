import { dirname } from "node:path";
import { expect, test } from "bun:test";
import { buildHarnessArgv } from "./argv";

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
