import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { Tool } from "@crew/core";
import { browserTools, type BrowserDriver } from "./browser";
export { MemoryBrowser, browserTools, type BrowserDriver, type A11yNode } from "./browser";
export { lazyPlaywrightBrowser } from "./playwright-browser";

const fileLocks = new Map<string, Promise<void>>();

async function withFileLock<T>(path: string, fn: () => T | Promise<T>): Promise<T> {
  const prev = fileLocks.get(path) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  fileLocks.set(path, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export function shellLockPath(command: string, root: string): string | undefined {
  const cmd = String(command ?? "").trim();
  if (/(^|[;&|]\s*)git\b/i.test(cmd)) return resolve(root, ".git");
  const m = cmd.match(/>>?\s*(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (!m) return undefined;
  const rel = (m[1] || m[2] || m[3] || "").trim();
  if (!rel || rel.startsWith("&")) return undefined;
  return resolve(root, rel);
}

function skipListName(name: string): boolean {
  return (
    name === ".crew" ||
    name === ".git" ||
    name === ".ssh" ||
    name === ".env" ||
    name.startsWith(".env.")
  );
}

function abs(root: string, rel: unknown): string {
  if (typeof rel !== "string" || rel.length === 0) {
    throw new Error("path is required");
  }
  return resolve(root, rel);
}

function fileExcerpt(body: string): string {
  const one = body.replace(/\r\n/g, "\n");
  if (one.length <= 400) return one;
  return `${one.slice(0, 397)}...`;
}

export function nativeTools(opts?: { shellTimeoutMs?: number; browser?: BrowserDriver }): Tool[] {
  const shellTimeoutMs = opts?.shellTimeoutMs ?? 30_000;
  const tools: Tool[] = [
    {
      name: "read",
      description: "Read a UTF-8 text file relative to the workspace",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      async execute(args, ctx) {
        return readFileSync(abs(ctx.workspaceRoot, args.path), "utf8");
      },
    },
    {
      name: "apply_patch",
      description:
        "Replace old_text with new_text in a workspace file. old_text must match uniquely.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_text: { type: "string" },
          new_text: { type: "string" },
        },
        required: ["path", "old_text", "new_text"],
      },
      async execute(args, ctx) {
        const path = abs(ctx.workspaceRoot, args.path);
        return withFileLock(path, () => {
          const oldText = String(args.old_text ?? "");
          const newText = String(args.new_text ?? "");
          let body = "";
          try {
            body = readFileSync(path, "utf8");
          } catch {
            if (oldText !== "") throw new Error(`file not found: ${args.path}`);
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, newText, "utf8");
            return `created ${args.path}`;
          }
          if (oldText === "") {
            throw new Error(
              `file exists: ${args.path} — pass old_text to replace, or pick a new path`,
            );
          }
          const first = body.indexOf(oldText);
          if (first === -1) {
            throw new Error(
              `old_text not found — re-read the file. Current file:\n${fileExcerpt(body)}`,
            );
          }
          if (body.indexOf(oldText, first + 1) !== -1) {
            throw new Error(
              "old_text matched more than once — re-read the file and pass a unique hunk",
            );
          }
          writeFileSync(path, body.replace(oldText, newText), "utf8");
          return `patched ${args.path}`;
        });
      },
    },
    {
      name: "list_dir",
      description: "List files in a workspace folder. Use this instead of shell ls.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Folder relative to workspace, or empty for root" } },
      },
      async execute(args, ctx) {
        const rel = typeof args.path === "string" && args.path.length ? args.path : ".";
        const dir = abs(ctx.workspaceRoot, rel);
        const names = readdirSync(dir).filter((name) => !skipListName(name));
        return names.join("\n") || "(empty)";
      },
    },
    {
      name: "shell",
      description:
        "Run a program (tests, npm, build). Do NOT use for writing files or listing — use apply_patch and list_dir.",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
      async execute(args, ctx) {
        const command = String(args.command ?? "").trim();
        if (!command) throw new Error("command is required");
        const run = () => {
          const result = spawnSync(command, {
            cwd: ctx.workspaceRoot,
            shell: true,
            encoding: "utf8",
            timeout: shellTimeoutMs,
            maxBuffer: 1024 * 1024,
            killSignal: "SIGKILL",
          });
          const timedOut =
            (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT" ||
            /ETIMEDOUT/i.test(String(result.error ?? ""));
          if (timedOut) {
            return `timed out after ${shellTimeoutMs}ms: ${command}`.slice(0, 8000);
          }
          const stdout = result.stdout ?? "";
          const stderr = result.stderr ?? "";
          const code = result.status ?? (result.error ? 1 : 0);
          return [`exit ${code}`, stdout, stderr].filter(Boolean).join("\n").slice(0, 8000);
        };
        const lock = shellLockPath(command, ctx.workspaceRoot);
        return lock ? withFileLock(lock, run) : run();
      },
    },
  ];
  if (opts?.browser) tools.push(...browserTools(opts.browser));
  return tools;
}
