import { resolve, sep } from "node:path";
import type { PermissionMode } from "./workspace";

export type PermissionVerdict = "allow" | "ask" | "deny";

export type ToolKind = "read" | "apply_patch" | "shell" | "list_dir" | "mcp" | "browser";

export function toolKind(name: string): ToolKind {
  if (name === "apply_patch" || name === "read" || name === "shell" || name === "list_dir") {
    return name;
  }
  if (name.startsWith("mcp_")) return "mcp";
  if (name.startsWith("browser_")) return "browser";
  return "shell";
}

export function hardDenyUrl(url: string): boolean {
  const raw = String(url ?? "").trim();
  if (!raw) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return true;
  }
  const proto = parsed.protocol.toLowerCase();
  if (
    proto === "file:" ||
    proto === "chrome:" ||
    proto === "chrome-extension:" ||
    proto === "javascript:" ||
    proto === "about:" ||
    proto === "data:" ||
    proto === "blob:"
  ) {
    return true;
  }
  if (/\.env(?:\.|$|\/)/i.test(parsed.pathname) || /\.env(?:\.|$|\/)/i.test(raw)) return true;
  return false;
}

export function hardDenyCommand(command: string): boolean {
  const c = String(command ?? "");
  if (/\.env\b/i.test(c)) return true;
  if (/\.ssh\b/i.test(c)) return true;
  if (/\brm\s+-rf\s+\//i.test(c)) return true;
  if (/\birm\b/i.test(c)) return true;
  if (/\bcurl\b[\s\S]*\|\s*iex\b/i.test(c)) return true;
  return false;
}

const DENY_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
]);

export function isDeniedPath(absPath: string): boolean {
  const lower = absPath.replaceAll("\\", "/").toLowerCase();
  const base = lower.split("/").pop() ?? "";
  if (DENY_NAMES.has(base)) return true;
  if (base.startsWith(".env.")) return true;
  if (lower.includes("/.ssh/") || lower.endsWith("/.ssh")) return true;
  if (base.startsWith("id_rsa") || base.startsWith("id_ed25519")) return true;
  return false;
}

export function isInsideWorkspace(workspaceRoot: string, absPath: string): boolean {
  const root = resolve(workspaceRoot);
  const target = resolve(absPath);
  const prefix = root.endsWith(sep) ? root : root + sep;
  return target === root || target.startsWith(prefix);
}

export function decidePermission(input: {
  mode: PermissionMode;
  tool: ToolKind;
  absPath?: string;
  workspaceRoot: string;
}): PermissionVerdict {
  if (input.absPath && isDeniedPath(input.absPath)) return "deny";

  const inside =
    input.absPath === undefined
      ? true
      : isInsideWorkspace(input.workspaceRoot, input.absPath);

  if (!inside && input.mode !== "full-access") {
    return input.tool === "read" ? "ask" : "ask";
  }
  if (!inside && input.mode === "full-access") {
    return input.tool === "shell" ? "allow" : "ask";
  }

  if (input.mode === "full-access") return "allow";
  if (input.mode === "supervised") {
    if ((input.tool === "read" || input.tool === "list_dir") && inside) return "allow";
    return "ask";
  }
  if (input.mode === "auto-accept") {
    if (input.tool === "read" || input.tool === "list_dir") return "allow";
    if (input.tool === "apply_patch" && inside) return "allow";
    if (input.tool === "shell") return "allow";
    return "ask";
  }
  // auto — caller maps missing reviewer to supervised before calling
  if (input.tool === "read" && inside) return "allow";
  return "ask";
}

export function effectiveMode(
  mode: PermissionMode,
  hasReviewer: boolean,
): { mode: PermissionMode; warned: boolean } {
  if (mode === "auto" && !hasReviewer) {
    return { mode: "supervised", warned: true };
  }
  return { mode, warned: false };
}

export function parseReviewerVerdict(text: string): "allow" | "deny" | "ask" {
  const first = String(text ?? "")
    .trim()
    .split(/\s+/)[0]
    ?.toUpperCase() ?? "";
  if (first === "ALLOW") return "allow";
  if (first === "DENY") return "deny";
  return "ask";
}
