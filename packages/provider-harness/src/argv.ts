import { dirname } from "node:path";

export const HARNESS_KINDS = ["claude", "codex", "grok", "opencode"] as const;
export type HarnessKind = (typeof HARNESS_KINDS)[number];

export type CrewPermissionMode = "supervised" | "auto-accept" | "auto" | "full-access";

export const DEFAULT_HARNESS_MODEL: Record<HarnessKind, string> = {
  grok: "grok-4.6",
  claude: "claude-sonnet-4-6",
  codex: "gpt-5.6-sol",
  opencode: "",
};

export function shouldSpawnHarness(mode: CrewPermissionMode): boolean {
  return mode !== "supervised";
}

export function buildHarnessArgv(input: {
  kind: HarnessKind;
  binary: string;
  cwd: string;
  promptFile: string;
  model?: string;
  mode?: CrewPermissionMode;
  mcpConfigPath?: string;
}): string[] {
  if (input.kind === "grok") return grokArgv(input);
  if (input.kind === "claude") return claudeArgv(input);
  if (input.kind === "codex") return codexArgv(input);
  return opencodeArgv(input);
}

function pushModel(argv: string[], model?: string) {
  const id = model?.trim();
  if (!id) return;
  if (id === "claude" || id === "codex" || id === "grok" || id === "opencode") return;
  argv.push("-m", id);
}

function pushMcp(argv: string[], path?: string) {
  const p = path?.trim();
  if (p) argv.push("--mcp-config", p);
}

function grokDenies(): string[] {
  const out: string[] = [];
  for (const rule of [
    "Read(**/.env)",
    "Read(**/.ssh/**)",
    "Edit(**/.env)",
    "Write(**/.env)",
    "Edit(**/.ssh/**)",
    "Write(**/.ssh/**)",
  ]) {
    out.push("--deny", rule);
  }
  return out;
}

function grokArgv(input: {
  binary: string;
  cwd: string;
  promptFile: string;
  model?: string;
  mode?: CrewPermissionMode;
  mcpConfigPath?: string;
}): string[] {
  const mode = input.mode ?? "auto-accept";
  const argv = [
    input.binary,
    "--prompt-file",
    input.promptFile,
    "--cwd",
    input.cwd,
    "--output-format",
    "streaming-json",
    "--verbatim",
    "--no-alt-screen",
    "--no-auto-update",
    "--max-turns",
    "8",
    ...grokDenies(),
  ];
  if (mode === "full-access") argv.push("--always-approve");
  else if (mode === "auto") argv.push("--permission-mode", "auto");
  else argv.push("--permission-mode", "acceptEdits");
  pushMcp(argv, input.mcpConfigPath);
  pushModel(argv, input.model);
  return argv;
}

function claudeArgv(input: {
  binary: string;
  cwd: string;
  promptFile: string;
  model?: string;
  mode?: CrewPermissionMode;
  mcpConfigPath?: string;
}): string[] {
  const dir = dirname(input.promptFile);
  const mode = input.mode ?? "auto-accept";
  const perm =
    mode === "full-access" ? "bypassPermissions" : mode === "auto" ? "auto" : "acceptEdits";
  const argv = [
    input.binary,
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    perm,
    "--max-turns",
    "8",
    "--add-dir",
    dir,
    "--append-system-prompt",
    "Never read or write .env or ~/.ssh or credential files.",
  ];
  pushMcp(argv, input.mcpConfigPath);
  pushModel(argv, input.model);
  argv.push(
    `Read the Crew brief at ${input.promptFile}. Follow it. Do the desk work with your own tools. Then write a first-person English account. The Crew office posts only that account.`,
  );
  return argv;
}

function codexArgv(input: {
  binary: string;
  cwd: string;
  promptFile: string;
  model?: string;
  mcpConfigPath?: string;
}): string[] {
  const argv = [
    input.binary,
    "exec",
    "--json",
    "--sandbox",
    "workspace-write",
    "-C",
    input.cwd,
    "--ephemeral",
  ];
  pushMcp(argv, input.mcpConfigPath);
  pushModel(argv, input.model);
  argv.push(
    `Read and follow the Crew brief at ${input.promptFile}. Never read or write .env or ~/.ssh. Then write a first-person English account.`,
  );
  return argv;
}

function opencodeArgv(input: {
  binary: string;
  cwd: string;
  promptFile: string;
  model?: string;
  mcpConfigPath?: string;
}): string[] {
  const argv = [
    input.binary,
    "run",
    "--format",
    "json",
    "--auto",
    "--dir",
    input.cwd,
    "--file",
    input.promptFile,
  ];
  pushMcp(argv, input.mcpConfigPath);
  pushModel(argv, input.model);
  argv.push(
    "Follow the attached Crew brief. Never read or write .env or ~/.ssh. Do the desk work with your own tools. Then write a first-person English account. The Crew office posts only that account.",
  );
  return argv;
}
