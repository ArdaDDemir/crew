import { join, resolve } from "node:path";
import type { ChatEvent } from "@crew/core";
import { createHost, readThread, sayChannel, sendDm, setMode, snapshot, type Host } from "./host";

export type ServerOpts = {
  cwd?: string;
  port?: number;
  hostname?: string;
  provider?: Host["provider"];
  publicDir?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function ndjsonStream(
  write: (push: (row: unknown) => void) => Promise<void>,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (row: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(row)}\n`));
      };
      try {
        await write(push);
      } catch (err) {
        push({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

export function handleRequest(host: Host, req: Request, publicDir: string): Promise<Response> | Response {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "GET" && path === "/api/health") {
    return json({ ok: true });
  }
  if (req.method === "GET" && path === "/api/bootstrap") {
    return json(snapshot(host));
  }
  if (req.method === "GET" && path === "/api/thread") {
    const kind = url.searchParams.get("kind") === "dm" ? "dm" : "channel";
    const id = url.searchParams.get("id") ?? "";
    if (!id) return json({ error: "id required" }, 400);
    return json(
      readThread(host, kind, id, {
        thinking: url.searchParams.get("thinking") === "1",
        verbose: url.searchParams.get("verbose") === "1",
      }),
    );
  }
  if (req.method === "POST" && path === "/api/mode") {
    return readBody(req).then((body) => {
      try {
        return json(setMode(host, String(body.channelId ?? ""), String(body.mode ?? "")));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/say") {
    return ndjsonStream(async (push) => {
      const body = await readBody(req);
      const channelId = String(body.channelId ?? "");
      const text = String(body.text ?? "").trim();
      if (!channelId || !text) {
        push({ type: "error", message: "channelId and text required" });
        return;
      }
      const result = await sayChannel(
        host,
        channelId,
        text,
        (botId: string, event: ChatEvent) => {
          if (event.type === "text-delta") {
            push({ type: "text", botId, text: event.text });
          } else if (event.type === "error") {
            push({ type: "error", botId, message: event.message });
          } else if (event.type === "reasoning-delta" && body.thinking) {
            push({ type: "thinking", botId, text: event.text });
          } else if (event.type === "tool-call" && body.verbose) {
            push({ type: "tool", botId, name: event.name });
          }
        },
        (message) => push({ type: "status", message }),
      );
      push({
        type: "done",
        woken: result.woken,
        dms: result.dms.map((d) => ({ threadId: d.threadId, botId: d.botId })),
      });
    });
  }
  if (req.method === "POST" && path === "/api/dm") {
    return readBody(req).then(async (body) => {
      try {
        const result = await sendDm(
          host,
          String(body.from ?? "human"),
          String(body.to ?? ""),
          String(body.text ?? ""),
        );
        return json(result);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }

  const file = path === "/" ? "/index.html" : path;
  const root = resolve(publicDir);
  const safe = resolve(root, file.replace(/^\/+/, "").replace(/\.\./g, ""));
  if (!safe.startsWith(root)) return json({ error: "nope" }, 403);
  const bunFile = Bun.file(safe);
  return bunFile.exists().then((ok) =>
    ok ? new Response(bunFile) : new Response("not found", { status: 404 }),
  );
}

export function startServer(opts: ServerOpts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const publicDir = opts.publicDir ?? join(import.meta.dir, "..", "public");
  const host = createHost({ cwd, provider: opts.provider });
  const port = opts.port ?? Number(process.env.CREW_UI_PORT ?? 7734);
  const hostname = opts.hostname ?? "127.0.0.1";
  const server = Bun.serve({
    port,
    hostname,
    fetch: (req) => handleRequest(host, req, publicDir),
  });
  return { server, host, url: `http://${hostname}:${server.port}` };
}

if (import.meta.main) {
  const { url } = startServer();
  console.log(`crew ui  ${url}`);
}
