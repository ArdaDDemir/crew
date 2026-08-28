import { join, resolve } from "node:path";
import type { ChatEvent } from "@crew/core";
import {
  botDetail,
  channelDetail,
  compactStatus,
  compactThread,
  createBot,
  createChannel,
  createHost,
  clearAlways,
  listAlways,
  listCatalog,
  readThread,
  removeBot,
  removeChannel,
  resolveAsk,
  sayChannel,
  skillDetail,
  threadDiff,
  sendDm,
  openDmChat,
  setAllowedModels,
  setApiKey,
  setFallbackModel,
  setMode,
  setModel,
  snapshot,
  stopRun,
  type Host,
  watchPayload,
  attachFiles,
  listPaths,
  regenerateTitle,
} from "./host";
import { loadJobs, parseJobsBody, saveJobs } from "./jobs";

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

function watchStream(host: Host, req: Request) {
  const encoder = new TextEncoder();
  let last = "";
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (force: boolean) => {
        const payload = watchPayload(host);
        const key = JSON.stringify(payload);
        if (!force && key === last) return;
        last = key;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      send(true);
      timer = setInterval(() => {
        try {
          send(false);
        } catch {
          if (timer) clearInterval(timer);
        }
      }, 1000);
      req.signal.addEventListener("abort", () => {
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
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
  const channelMatch = path.match(/^\/api\/channel\/([^/]+)$/);
  if (channelMatch && req.method === "GET") {
    try {
      return json(channelDetail(host, decodeURIComponent(channelMatch[1]!)));
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  }
  if (channelMatch && req.method === "DELETE") {
    try {
      return json(removeChannel(host, decodeURIComponent(channelMatch[1]!)));
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  }
  if (channelMatch && req.method === "PATCH") {
    return readBody(req).then((body) => {
      try {
        const folders =
          typeof body.folders === "string"
            ? body.folders.split("\n").map((s) => s.trim()).filter(Boolean)
            : Array.isArray(body.folders)
              ? (body.folders as string[])
              : undefined;
        return json(
          host.workspace.updateChannel(decodeURIComponent(channelMatch[1]!), {
            title: body.title !== undefined ? String(body.title) : undefined,
            icon: body.icon !== undefined ? String(body.icon) : undefined,
            leadBotId: body.leadBotId !== undefined ? String(body.leadBotId) : undefined,
            memberBotIds: Array.isArray(body.memberBotIds)
              ? (body.memberBotIds as string[])
              : undefined,
            rules: body.rules !== undefined ? String(body.rules) : undefined,
            context: body.context !== undefined ? String(body.context) : undefined,
            folders,
            permissionMode: body.permissionMode !== undefined
              ? (String(body.permissionMode) as never)
              : undefined,
          }),
        );
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  const skillOne = path.match(/^\/api\/bot\/([^/]+)\/skills\/([^/]+)$/);
  if (skillOne && req.method === "GET") {
    try {
      return json(
        skillDetail(host, decodeURIComponent(skillOne[1]!), decodeURIComponent(skillOne[2]!)),
      );
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  }
  if (skillOne && req.method === "DELETE") {
    try {
      host.workspace.removeSkill(
        decodeURIComponent(skillOne[1]!),
        decodeURIComponent(skillOne[2]!),
      );
      return json(botDetail(host, decodeURIComponent(skillOne[1]!)));
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  }
  const skillMatch = path.match(/^\/api\/bot\/([^/]+)\/skills$/);
  if (skillMatch && req.method === "POST") {
    return readBody(req).then((body) => {
      try {
        host.workspace.addSkill(decodeURIComponent(skillMatch[1]!), {
          name: String(body.name ?? ""),
          description: String(body.description ?? ""),
          body: String(body.body ?? ""),
        });
        return json(botDetail(host, decodeURIComponent(skillMatch[1]!)));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  const botMatch = path.match(/^\/api\/bot\/([^/]+)$/);
  if (botMatch && req.method === "GET") {
    try {
      return json(botDetail(host, decodeURIComponent(botMatch[1]!)));
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  }
  if (botMatch && req.method === "DELETE") {
    try {
      return json(removeBot(host, decodeURIComponent(botMatch[1]!)));
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  }
  if (botMatch && req.method === "PATCH") {
    return readBody(req).then((body) => {
      try {
        return json(
          host.workspace.updateBot(decodeURIComponent(botMatch[1]!), {
            name: body.name !== undefined ? String(body.name) : undefined,
            icon: body.icon !== undefined ? String(body.icon) : undefined,
            model: body.model !== undefined ? String(body.model) : undefined,
            soul: body.soul !== undefined ? String(body.soul) : undefined,
            standingOrders:
              body.standingOrders !== undefined ? String(body.standingOrders) : undefined,
            fallbackModel:
              body.fallbackModel !== undefined ? String(body.fallbackModel) : undefined,
          }),
        );
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "GET" && path === "/api/models") {
    return listCatalog(host, url.searchParams.get("q") ?? "").then(
      (models) => json({ models }),
      (err) => json({ error: err instanceof Error ? err.message : String(err) }, 400),
    );
  }
  if (req.method === "POST" && path === "/api/key") {
    return readBody(req).then((body) => {
      try {
        return json(setApiKey(host, String(body.apiKey ?? "")));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/allowed-models") {
    return readBody(req).then((body) => {
      try {
        const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
        return json(setAllowedModels(host, ids));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/fallback") {
    return readBody(req).then((body) => {
      try {
        return json(setFallbackModel(host, String(body.model ?? "")));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/model") {
    return readBody(req).then((body) => {
      try {
        return json(setModel(host, String(body.model ?? "")));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
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
  if (req.method === "POST" && path === "/api/bots") {
    return readBody(req).then((body) => {
      try {
        return json(
          createBot(host, {
            id: String(body.id ?? ""),
            name: String(body.name ?? ""),
            soul: body.soul !== undefined ? String(body.soul) : undefined,
            icon: body.icon !== undefined ? String(body.icon) : undefined,
            channelId: body.channelId !== undefined ? String(body.channelId) : undefined,
          }),
        );
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/channels") {
    return readBody(req).then((body) => {
      try {
        return json(
          createChannel(host, {
            id: String(body.id ?? ""),
            title: body.title !== undefined ? String(body.title) : undefined,
            leadBotId: body.leadBotId !== undefined ? String(body.leadBotId) : undefined,
            memberBotIds: Array.isArray(body.memberBotIds)
              ? (body.memberBotIds as string[])
              : undefined,
            icon: body.icon !== undefined ? String(body.icon) : undefined,
            permissionMode: body.permissionMode !== undefined ? String(body.permissionMode) : undefined,
            context: body.context !== undefined ? String(body.context) : undefined,
            rules: body.rules !== undefined ? String(body.rules) : undefined,
            folders: Array.isArray(body.folders) ? (body.folders as string[]) : undefined,
          }),
        );
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/stop") {
    return json(stopRun(host));
  }
  if (req.method === "GET" && path === "/api/watch") {
    return watchStream(host, req);
  }
  if (req.method === "GET" && path === "/api/diff") {
    const kind = url.searchParams.get("kind") === "dm" ? "dm" : "channel";
    const id = url.searchParams.get("id") ?? "";
    if (!id) return json({ error: "id required" }, 400);
    return json(threadDiff(host, kind, id));
  }
  if (req.method === "GET" && path === "/api/compact-status") {
    const kind = url.searchParams.get("kind") === "dm" ? "dm" : "channel";
    const id = url.searchParams.get("id") ?? "";
    if (!id) return json({ error: "id required" }, 400);
    return json(compactStatus(host, kind, id));
  }
  if (req.method === "POST" && path === "/api/compact") {
    return readBody(req).then(async (body) => {
      try {
        const kind = body.kind === "dm" ? "dm" : "channel";
        const id = String(body.id ?? "");
        if (!id) return json({ error: "id required" }, 400);
        return json(await compactThread(host, kind, id));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, 400);
      }
    });
  }
  if (req.method === "GET" && path === "/api/paths") {
    return json(listPaths(host, url.searchParams.get("q") ?? ""));
  }
  if (req.method === "GET" && path === "/api/permissions") {
    return json(listAlways(host));
  }
  if (req.method === "DELETE" && path === "/api/permissions") {
    return json(clearAlways(host));
  }
  if (req.method === "POST" && path === "/api/permission") {
    return readBody(req).then((body) => {
      try {
        return json(
          resolveAsk(host, String(body.decision ?? ""), {
            tool: body.tool !== undefined ? String(body.tool) : undefined,
            args:
              body.args && typeof body.args === "object" && !Array.isArray(body.args)
                ? (body.args as Record<string, unknown>)
                : undefined,
          }),
        );
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "GET" && path === "/api/jobs") {
    return json(loadJobs(host));
  }
  if (req.method === "PUT" && path === "/api/jobs") {
    return readBody(req).then((body) => {
      try {
        return json(saveJobs(host, parseJobsBody(host, body)));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/thread-title") {
    return readBody(req).then(async (body) => {
      try {
        const kind = body.kind === "dm" ? "dm" : "channel";
        const id = String(body.id ?? "");
        if (!id) return json({ error: "id required" }, 400);
        return json(await regenerateTitle(host, kind, id));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/attach") {
    return readBody(req).then(async (body) => {
      try {
        const files = Array.isArray(body.files) ? (body.files as { path: string; content: string }[]) : [];
        return json(await attachFiles(host, files));
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
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(event.arguments || "{}") as Record<string, unknown>;
            } catch {
              args = { _raw: event.arguments };
            }
            push({ type: "tool", botId, name: event.name, args });
          }
        },
        (message) => push({ type: "status", message }),
        (botId, tool, args) => push({ type: "ask", botId, tool, args }),
      );
      push({
        type: "done",
        woken: result.woken,
        dms: result.dms.map((d) => ({ threadId: d.threadId, botId: d.botId })),
      });
    });
  }
  if (req.method === "POST" && path === "/api/dm/new") {
    return readBody(req).then((body) => {
      try {
        return json(openDmChat(host, String(body.to ?? "")));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
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
          typeof body.threadId === "string" ? body.threadId : undefined,
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
  const preferred = opts.port ?? Number(process.env.CREW_UI_PORT ?? 7734);
  const hostname = opts.hostname ?? "127.0.0.1";
  const fetch = (req: Request) => handleRequest(host, req, publicDir);
  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({ port: preferred, hostname, fetch });
  } catch (err) {
    const busy =
      err instanceof Error &&
      (/EADDRINUSE/i.test(err.message) || /port .* in use/i.test(err.message));
    if (!busy || preferred === 0) throw err;
    server = Bun.serve({ port: 0, hostname, fetch });
  }
  return { server, host, url: `http://${hostname}:${server.port}` };
}

if (import.meta.main) {
  const { url } = startServer();
  console.log(`crew ui  ${url}`);
}
