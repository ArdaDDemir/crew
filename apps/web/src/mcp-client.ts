import type { Tool } from "@crew/core";
import type { McpServer } from "./mcp";

export type McpRpc = {
  request(method: string, params?: unknown): Promise<unknown>;
  notify(method: string, params?: unknown): void;
  close(): Promise<void>;
};

export type McpToolDef = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type FakeMcp = {
  tools: McpToolDef[];
  call?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

const SEP = Buffer.from("\r\n\r\n");

export function fakeMcpRpc(fake: FakeMcp): McpRpc {
  return {
    async request(method, params) {
      if (method === "initialize") {
        return {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "fake" },
        };
      }
      if (method === "tools/list") return { tools: fake.tools };
      if (method === "tools/call") {
        const p = (params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        if (fake.call) return fake.call(String(p.name ?? ""), p.arguments ?? {});
        return { content: [{ type: "text", text: "" }] };
      }
      return {};
    },
    notify() {},
    async close() {},
  };
}

export function formatMcpResult(raw: unknown): string {
  if (!raw || typeof raw !== "object") return String(raw ?? "");
  const row = raw as { content?: unknown; isError?: unknown; message?: unknown };
  if (row.isError) return `mcp error: ${String(row.message ?? JSON.stringify(raw))}`;
  if (Array.isArray(row.content)) {
    const texts = row.content
      .map((block) => {
        if (!block || typeof block !== "object") return "";
        const b = block as { type?: unknown; text?: unknown };
        if (b.type === "text" || typeof b.text === "string") return String(b.text ?? "");
        return "";
      })
      .filter(Boolean);
    if (texts.length) return texts.join("\n");
  }
  return JSON.stringify(raw);
}

export function crewToolName(server: string, tool: string): string {
  const s = server.replace(/[^a-z0-9-]+/gi, "_").replace(/^_+|_+$/g, "") || "srv";
  const t = tool.replace(/[^a-z0-9_]+/gi, "_").replace(/^_+|_+$/g, "") || "tool";
  return `mcp_${s}_${t}`.slice(0, 64);
}

export function crewToolsFromMcp(
  server: string,
  defs: McpToolDef[],
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>,
): Tool[] {
  return defs.slice(0, 32).map((def) => {
    const original = def.name;
    const name = crewToolName(server, original);
    const parameters =
      def.inputSchema && typeof def.inputSchema === "object"
        ? def.inputSchema
        : { type: "object", properties: {} };
    return {
      name,
      description: `[MCP ${server}] ${def.description || original}`,
      parameters,
      async execute(args) {
        const raw = await call(original, args);
        return formatMcpResult(raw);
      },
    };
  });
}

export async function collectMcpSessions(input: {
  servers: McpServer[];
  cwd: string;
  signal?: AbortSignal;
  connect?: (server: McpServer) => McpRpc;
}): Promise<{ tools: Tool[]; close: () => Promise<void> }> {
  const tools: Tool[] = [];
  const closers: Array<() => Promise<void>> = [];
  for (const server of input.servers) {
    if (!server.enabled || (!server.command && !server.url)) continue;
    try {
      const rpc =
        input.connect?.(server) ??
        (server.url
          ? httpMcpRpc(server.url, server.headers, input.signal)
          : spawnMcpStdio(server, { cwd: input.cwd, signal: input.signal }));
      const session = await openMcpSession(server.name, rpc);
      tools.push(...session.tools);
      closers.push(() => session.close());
    } catch {
      /* skip dead server */
    }
    if (tools.length >= 32) break;
  }
  return {
    tools: tools.slice(0, 32),
    async close() {
      for (const fn of closers) await fn().catch(() => undefined);
    },
  };
}

export async function openMcpSession(
  server: string,
  rpc: McpRpc,
): Promise<{ tools: Tool[]; close: () => Promise<void> }> {
  await rpc.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "crew", version: "0.3.0" },
  });
  rpc.notify("notifications/initialized");
  const listed = (await rpc.request("tools/list")) as { tools?: McpToolDef[] };
  const defs = Array.isArray(listed?.tools) ? listed.tools : [];
  const tools = crewToolsFromMcp(server, defs, (name, args) =>
    rpc.request("tools/call", { name, arguments: args }),
  );
  return { tools, close: () => rpc.close() };
}

export function httpMcpRpc(
  url: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): McpRpc {
  let nextId = 1;
  return {
    async request(method, params) {
      const id = nextId++;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(headers ?? {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal,
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`mcp http ${res.status}: ${raw.slice(0, 200)}`);
      const ct = res.headers.get("content-type") || "";
      const parsed = ct.includes("text/event-stream") ? parseSseJsonRpc(raw, id) : (JSON.parse(raw) as { result?: unknown; error?: { message?: string }; id?: unknown });
      if (parsed.error) throw new Error(String(parsed.error.message ?? "mcp http error"));
      return parsed.result;
    },
    notify(method, params) {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(headers ?? {}) },
        body: JSON.stringify({ jsonrpc: "2.0", method, params }),
        signal,
      }).catch(() => undefined);
    },
    async close() {},
  };
}

function parseSseJsonRpc(raw: string, id: number): { result?: unknown; error?: { message?: string }; id?: unknown } {
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const obj = JSON.parse(data) as { result?: unknown; error?: { message?: string }; id?: unknown };
      if (obj.id === id || obj.id === undefined) return obj;
    } catch {
      /* skip */
    }
  }
  throw new Error("mcp sse: no json-rpc payload");
}

export function spawnMcpStdio(
  server: McpServer,
  opts: { cwd: string; signal?: AbortSignal },
): McpRpc {
  const proc = Bun.spawn([server.command, ...server.args], {
    cwd: opts.cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...server.env },
    signal: opts.signal,
  });
  let buf = Buffer.alloc(0);
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let nextId = 1;
  let closed = false;

  const pump = (async () => {
    const reader = proc.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf = Buffer.concat([buf, Buffer.from(value)]);
        while (true) {
          const msg = takeMessage();
          if (!msg) break;
          const id = typeof msg.id === "number" ? msg.id : Number(msg.id);
          const wait = pending.get(id);
          if (!wait) continue;
          pending.delete(id);
          if (msg.error) {
            wait.reject(new Error(String((msg.error as { message?: string }).message ?? "mcp error")));
          } else wait.resolve(msg.result);
        }
      }
    } catch {
      /* closed */
    }
    for (const wait of pending.values()) wait.reject(new Error("mcp closed"));
    pending.clear();
  })();

  function takeMessage(): { id?: unknown; result?: unknown; error?: unknown } | null {
    const idx = buf.indexOf(SEP);
    if (idx >= 0) {
      const header = buf.subarray(0, idx).toString("utf8");
      const m = header.match(/Content-Length:\s*(\d+)/i);
      if (m) {
        const n = Number(m[1]);
        const start = idx + SEP.length;
        if (buf.length < start + n) return null;
        const json = buf.subarray(start, start + n).toString("utf8");
        buf = buf.subarray(start + n);
        return JSON.parse(json) as { id?: unknown; result?: unknown; error?: unknown };
      }
    }
    const nl = buf.indexOf(10);
    if (nl < 0) return null;
    const line = buf.subarray(0, nl).toString("utf8").trim();
    buf = buf.subarray(nl + 1);
    if (!line.startsWith("{")) return takeMessage();
    return JSON.parse(line) as { id?: unknown; result?: unknown; error?: unknown };
  }

  function write(obj: unknown) {
    if (closed || !proc.stdin) return;
    const body = Buffer.from(JSON.stringify(obj), "utf8");
    const frame = Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
    proc.stdin.write(frame);
  }

  return {
    request(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`mcp timeout: ${method}`));
        }, 15000);
        pending.set(id, {
          resolve: (v) => {
            clearTimeout(timer);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        write({ jsonrpc: "2.0", id, method, params });
      });
    },
    notify(method, params) {
      write({ jsonrpc: "2.0", method, params });
    },
    async close() {
      closed = true;
      try {
        proc.stdin?.end();
      } catch {
        /* ignore */
      }
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      await Promise.race([pump, proc.exited, Bun.sleep(500)]);
    },
  };
}
