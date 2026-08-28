import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type McpServer = {
  name: string;
  enabled: boolean;
  command: string;
  args: string[];
  env: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};

export type McpFile = { servers: McpServer[] };

const MAX_SERVERS = 8;

export function mcpPath(cwd: string): string {
  return join(cwd, ".crew", "mcp.json");
}

export function defaultMcp(): McpFile {
  return { servers: [] };
}

export function slugMcpName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function asArgs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => String(a ?? "").trim()).filter(Boolean).slice(0, 32);
}

function asEnv(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k).trim();
    if (!key || key.includes("=")) continue;
    out[key] = String(v ?? "");
    if (Object.keys(out).length >= 32) break;
  }
  return out;
}

function asServer(raw: unknown): McpServer | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as {
    name?: unknown;
    enabled?: unknown;
    command?: unknown;
    args?: unknown;
    env?: unknown;
    url?: unknown;
    headers?: unknown;
  };
  const name = slugMcpName(String(row.name ?? ""));
  const command = String(row.command ?? "").trim();
  const url = String(row.url ?? "").trim();
  if (!name || (!command && !url)) return null;
  const server: McpServer = {
    name,
    enabled: row.enabled !== false,
    command,
    args: asArgs(row.args),
    env: asEnv(row.env),
  };
  if (url) server.url = url;
  const headers = asEnv(row.headers);
  if (Object.keys(headers).length) server.headers = headers;
  return server;
}

export function parseMcpBody(body: unknown): McpFile {
  const file = defaultMcp();
  if (!body || typeof body !== "object") return file;
  const servers = (body as { servers?: unknown }).servers;
  if (!Array.isArray(servers)) return file;
  const seen = new Set<string>();
  for (const item of servers) {
    const row = asServer(item);
    if (!row || seen.has(row.name)) continue;
    seen.add(row.name);
    file.servers.push(row);
    if (file.servers.length >= MAX_SERVERS) break;
  }
  return file;
}

export function loadMcp(cwd: string): McpFile {
  const path = mcpPath(cwd);
  if (!existsSync(path)) return defaultMcp();
  try {
    return parseMcpBody(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    return defaultMcp();
  }
}

export function writeHarnessMcpConfig(cwd: string, file: McpFile): string | undefined {
  const enabled = file.servers.filter((s) => s.enabled && (s.command || s.url));
  if (!enabled.length) return undefined;
  const mcpServers: Record<string, unknown> = {};
  for (const s of enabled) {
    if (s.url) {
      mcpServers[s.name] = { type: "http", url: s.url, headers: s.headers ?? {} };
    } else {
      mcpServers[s.name] = { command: s.command, args: s.args, env: s.env };
    }
  }
  const path = join(cwd, ".crew", "harness-mcp.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ mcpServers }, null, 2)}\n`, "utf8");
  return path;
}

export function saveMcp(cwd: string, file: McpFile): McpFile {
  const next = parseMcpBody(file);
  const path = mcpPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
