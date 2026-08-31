import { join, resolve } from "node:path";
import { OWNER_HUMAN_ID, parseDmThreadId, type ChatEvent } from "@crew/core";
import {
  addAlways,
  botDetail,
  channelDetail,
  compactStatus,
  compactThread,
  createBot,
  createChannel,
  createHost,
  clearAlways,
  checkProviders,
  getMcp,
  getProviders,
  listMcpTools,
  listProviderModels,
  putMcp,
  listAlways,
  listCatalog,
  parseHarness,
  putProviders,
  readThread,
  shotFile,
  removeAlways,
  removeBot,
  removeChannel,
  resolveAsk,
  sayChannel,
  skillDetail,
  threadDiff,
  sendDm,
  shotPathFromOutput,
  openDmChat,
  setAllowedModels,
  setApiKey,
  setAutoCompact,
  setBaseUrl,
  setDefaultPermissionMode,
  setFallbackModel,
  setMode,
  setModel,
  setReviewerModel,
    setUpdateUrl,
    setAutoUpdate,
    updateInstall,
  checkHostUpdate,
  snapshot,
  stopRun,
  type Host,
  watchPayload,
  attachFiles,
  listPaths,
  regenerateTitle,
} from "./host";
import { flagsFromArgv, parseServerArgv, resolvePublicDir } from "./argv";
import { attachDiscordHost } from "./discord-attach";
import { loadJobs, parseJobsBody, saveJobs } from "./jobs";
import { loadDmPrefs, parseDmPrefsBody, saveDmPrefs } from "./dm-prefs";
import {
  humanForToken,
  inviteActor,
  inviteHuman,
  inviteTokenFrom,
  loadHumans,
  publicHumans,
  revokeInvite,
  saveHumans,
} from "./humans";
import { CREW_VERSION } from "./version";
import { loadFloor, saveFloor } from "./floor";
import { loadLooks, saveLook } from "./looks";
import { sanitizeFolderHints } from "../public/workspace-path.js";

export type ServerOpts = {
  cwd?: string;
  port?: number;
  hostname?: string;
  provider?: Host["provider"];
  publicDir?: string;
  cors?: string;
};

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
}

function withCors(res: Response, origin?: string): Response {
  if (!origin) return res;
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

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

export function ndjsonStream(
  write: (push: (row: unknown) => void) => Promise<void>,
  pingMs = 5000,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (row: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(row)}\n`));
      };
      const timer =
        pingMs > 0
          ? setInterval(() => {
              try {
                controller.enqueue(encoder.encode('{"type":"ping"}\n'));
              } catch {
                /* stream already gone */
              }
            }, pingMs)
          : undefined;
      try {
        await write(push);
      } catch (err) {
        try {
          push({ type: "error", message: err instanceof Error ? err.message : String(err) });
        } catch {
          /* stream already gone */
        }
      } finally {
        if (timer) clearInterval(timer);
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

function guestMayWrite(method: string, path: string): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  if (method === "PUT" && path === "/api/looks") return true;
  if (method !== "POST") return false;
  return (
    path === "/api/say" ||
    path === "/api/dm" ||
    path === "/api/permission" ||
    path === "/api/stop"
  );
}

function ownerGate(req: Request, host: Host): Response | undefined {
  const actor = inviteActor(req, undefined, loadHumans(host.cwd));
  if (actor === "invalid") return json({ error: "invalid invite" }, 401);
  if (actor === "guest") return json({ error: "owner only" }, 403);
  return undefined;
}

export function handleRequest(host: Host, req: Request, publicDir: string): Promise<Response> | Response {
  const url = new URL(req.url);
  const path = url.pathname;

  const mutating =
    req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  if (!guestMayWrite(req.method, path)) {
    const blocked = ownerGate(req, host);
    if (blocked) return blocked;
  } else if (mutating) {
    const actor = inviteActor(req, undefined, loadHumans(host.cwd));
    if (actor === "invalid") return json({ error: "invalid invite" }, 401);
  }

  if (req.method === "GET" && path === "/api/who") {
    const file = loadHumans(host.cwd);
    const actor = inviteActor(req, undefined, file);
    if (actor === "invalid") return json({ error: "invalid invite" }, 401);
    if (actor === "guest") {
      const row = humanForToken(file, inviteTokenFrom(req));
      return json({ id: row?.id ?? "", handle: row?.handle ?? "", owner: false });
    }
    return json({ id: OWNER_HUMAN_ID, handle: "owner", owner: true });
  }
  if (req.method === "GET" && path === "/api/floor") {
    const id = url.searchParams.get("id") ?? "";
    if (!id) return json({ error: "id required" }, 400);
    if (!host.workspace.getChannel(id)) return json({ error: "unknown channel" }, 400);
    return json(loadFloor(host.cwd, id));
  }
  if (req.method === "PUT" && path === "/api/floor") {
    return readBody(req).then((body) => {
      const id = String(body.id ?? "").trim();
      if (!id) return json({ error: "id required" }, 400);
      if (!host.workspace.getChannel(id)) return json({ error: "unknown channel" }, 400);
      return json(saveFloor(host.cwd, id, { furniture: body.furniture }));
    });
  }
  if (req.method === "GET" && path === "/api/looks") {
    return json(loadLooks(host.cwd));
  }
  if (req.method === "PUT" && path === "/api/looks") {
    return readBody(req).then((body) => {
      const file = loadHumans(host.cwd);
      const actor = inviteActor(req, body, file);
      if (actor === "invalid") return json({ error: "invalid invite" }, 401);
      const botId = String(body.botId ?? "").trim();
      if (actor === "guest") {
        if (botId) return json({ error: "owner only" }, 403);
        const row = humanForToken(file, inviteTokenFrom(req, body));
        const humanId = row?.id ?? "";
        if (!humanId) return json({ error: "owner only" }, 403);
        const asked = String(body.humanId ?? "").trim();
        if (asked && asked !== humanId) return json({ error: "owner only" }, 403);
        return json(
          saveLook(host.cwd, {
            humanId,
            skin: body.skin !== undefined ? String(body.skin) : undefined,
            hair: body.hair !== undefined ? String(body.hair) : undefined,
            top: body.top !== undefined ? String(body.top) : undefined,
          }),
        );
      }
      const humanId = String(body.humanId ?? "").trim();
      if (!botId && !humanId) {
        return json(
          saveLook(host.cwd, {
            humanId: OWNER_HUMAN_ID,
            skin: body.skin !== undefined ? String(body.skin) : undefined,
            hair: body.hair !== undefined ? String(body.hair) : undefined,
            top: body.top !== undefined ? String(body.top) : undefined,
          }),
        );
      }
      if (botId && !host.workspace.getBot(botId)) return json({ error: "unknown bot" }, 400);
      return json(
        saveLook(host.cwd, {
          botId: botId || undefined,
          humanId: botId ? undefined : humanId,
          skin: body.skin !== undefined ? String(body.skin) : undefined,
          hair: body.hair !== undefined ? String(body.hair) : undefined,
          top: body.top !== undefined ? String(body.top) : undefined,
        }),
      );
    });
  }
  if (req.method === "GET" && path === "/api/health") {
    return json({ ok: true, version: CREW_VERSION });
  }
  if (req.method === "GET" && path === "/api/shot") {
    const abs = shotFile(host.cwd, url.searchParams.get("path") ?? "");
    if (!abs) return json({ error: "forbidden" }, 403);
    const bunFile = Bun.file(abs);
    return bunFile.exists().then((ok) =>
      ok
        ? new Response(bunFile, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } })
        : new Response("not found", { status: 404 }),
    );
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
          typeof body.folders === "string" || Array.isArray(body.folders)
            ? sanitizeFolderHints(body.folders, host.cwd)
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
            titleModel:
              body.titleModel !== undefined ? String(body.titleModel) : undefined,
            harness: body.harness !== undefined ? parseHarness(body.harness) : undefined,
            harnessModel:
              body.harnessModel !== undefined
                ? body.harnessModel === null
                  ? null
                  : String(body.harnessModel)
                : undefined,
            effort: body.effort !== undefined ? String(body.effort) : undefined,
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
        return json(
          setModel(host, String(body.model ?? ""), {
            harness: body.harness === undefined ? undefined : (body.harness as string | null),
            harnessModel:
              body.harnessModel === undefined ? undefined : (body.harnessModel as string | null),
          }),
        );
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/base-url") {
    return readBody(req).then((body) => {
      try {
        return json(setBaseUrl(host, String(body.baseUrl ?? "")));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/default-mode") {
    return readBody(req).then((body) => {
      try {
        return json(setDefaultPermissionMode(host, String(body.mode ?? "")));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/auto-compact") {
    return readBody(req).then((body) => {
      try {
        return json(setAutoCompact(host, body.on !== false && body.on !== "false"));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/reviewer") {
    return readBody(req).then((body) => {
      try {
        return json(setReviewerModel(host, String(body.model ?? "")));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/update-url") {
    return readBody(req).then((body) => {
      try {
        return json(setUpdateUrl(host, String(body.updateUrl ?? "")));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/update-auto") {
    const gate = ownerGate(req, host);
    if (gate) return gate;
    return readBody(req).then((body) => json(setAutoUpdate(host, body.autoUpdate)));
  }
  if (req.method === "POST" && path === "/api/update-check") {
    return checkHostUpdate(host).then((body) => json(body));
  }
  if (req.method === "POST" && path === "/api/update-install") {
    const gate = ownerGate(req, host);
    if (gate) return gate;
    return readBody(req).then((body) =>
      updateInstall(host, { url: String(body.url ?? "") }).then(
        (row) => json(row),
        (err) => json({ error: err instanceof Error ? err.message : String(err) }, 400),
      ),
    );
  }
  if (req.method === "GET" && path === "/api/providers") {
    return json(getProviders(host));
  }
  if (req.method === "GET" && path === "/api/providers/health") {
    return checkProviders(host).then(
      (body) => json(body),
      (err) => json({ error: err instanceof Error ? err.message : String(err) }, 400),
    );
  }
  if (req.method === "GET" && path === "/api/providers/models") {
    return listProviderModels(host).then(
      (body) => json(body),
      (err) => json({ error: err instanceof Error ? err.message : String(err) }, 400),
    );
  }
  if (req.method === "PUT" && path === "/api/providers") {
    return readBody(req).then((body) => {
      try {
        return json(putProviders(host, body));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "GET" && path === "/api/mcp") {
    return json(getMcp(host));
  }
  if (req.method === "GET" && path === "/api/mcp/tools") {
    return listMcpTools(host).then(
      (body) => json(body),
      (err) => json({ error: err instanceof Error ? err.message : String(err) }, 400),
    );
  }
  if (req.method === "PUT" && path === "/api/mcp") {
    return readBody(req).then((body) => {
      try {
        return json(putMcp(host, body));
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
            folders: Array.isArray(body.folders)
              ? sanitizeFolderHints(body.folders, host.cwd)
              : undefined,
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
  if (req.method === "POST" && path === "/api/permissions") {
    return readBody(req).then((body) => {
      try {
        return json(
          addAlways(host, String(body.tool ?? ""), {
            path: body.path,
            command: body.command,
          }),
        );
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "DELETE" && path === "/api/permissions") {
    const tool = url.searchParams.get("tool") ?? "";
    const key = url.searchParams.get("key") ?? "";
    if (tool || key) {
      try {
        return json(removeAlways(host, tool, key));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    }
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
  if (req.method === "GET" && path === "/api/humans") {
    return json(publicHumans(loadHumans(host.cwd)));
  }
  if (req.method === "POST" && path === "/api/humans") {
    return readBody(req).then((body) => {
      const actor = inviteActor(req, body, loadHumans(host.cwd));
      if (actor === "invalid") return json({ error: "invalid invite" }, 401);
      if (actor === "guest") return json({ error: "owner only" }, 403);
      try {
        const invited = inviteHuman(loadHumans(host.cwd), {
          id: String(body.id ?? ""),
          handle: String(body.handle ?? ""),
        });
        saveHumans(host.cwd, invited.file);
        const row = invited.file.humans.find((h) => h.id === String(body.id ?? "").trim());
        return json({
          id: row?.id ?? String(body.id ?? "").trim(),
          handle: row?.handle ?? String(body.handle ?? "").trim(),
          token: invited.token,
        });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });
  }
  if (req.method === "POST" && path === "/api/humans/revoke") {
    return readBody(req).then((body) => {
      const actor = inviteActor(req, body, loadHumans(host.cwd));
      if (actor === "invalid") return json({ error: "invalid invite" }, 401);
      if (actor === "guest") return json({ error: "owner only" }, 403);
      const id = String(body.id ?? "").trim();
      if (!id) return json({ error: "id required" }, 400);
      const next = saveHumans(host.cwd, revokeInvite(loadHumans(host.cwd), id));
      return json(publicHumans(next));
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
    return readBody(req).then((body) => {
      const invite = inviteTokenFrom(req, body);
      let humanId: string | undefined;
      if (invite) {
        const row = humanForToken(loadHumans(host.cwd), invite);
        if (!row) return json({ error: "invalid invite" }, 401);
        humanId = row.id;
      }
      return ndjsonStream(async (push) => {
      const text = String(body.text ?? "").trim();
      const kind = body.kind === "dm" ? "dm" : "channel";
      const channelId = String(body.channelId ?? body.id ?? "");
      if (!channelId || !text) {
        push({ type: "error", message: "channelId and text required" });
        return;
      }
      const onEvent = (botId: string, event: ChatEvent) => {
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
        };
      const onToolDone = (row: { botId: string; name: string; output: string }) => {
        if (!body.verbose) return;
        const shot = shotPathFromOutput(row.output);
        push({
          type: "tool",
          botId: row.botId,
          name: row.name,
          args: {},
          output: row.output,
          ...(shot ? { shot } : {}),
        });
      };
      const onStatus = (message: string) => push({ type: "status", message });
      const onAsk = (botId: string, tool: string, args: Record<string, unknown>) =>
        push({ type: "ask", botId, tool, args });
      if (kind === "dm") {
        let to = "";
        try {
          to = parseDmThreadId(channelId).right;
        } catch (err) {
          push({ type: "error", message: err instanceof Error ? err.message : String(err) });
          return;
        }
        const result = await sendDm(
          host,
          "human",
          to,
          text,
          channelId,
          onEvent,
          onStatus,
          onAsk,
          humanId,
          onToolDone,
        );
        push({
          type: "done",
          woken: result.woken,
          dms: [{ threadId: result.threadId, botId: result.replies[0]?.botId }],
        });
        return;
      }
      const result = await sayChannel(
        host,
        channelId,
        text,
        onEvent,
        onStatus,
        onAsk,
        humanId,
        onToolDone,
      );
      push({
        type: "done",
        woken: result.woken,
        dms: result.dms.map((d) => ({ threadId: d.threadId, botId: d.botId })),
        held: result.held ?? null,
        ignored: result.ignored ?? null,
      });
    });
    });
  }
  if (req.method === "GET" && path === "/api/dm-prefs") {
    return json(loadDmPrefs(host.cwd));
  }
  if (req.method === "PUT" && path === "/api/dm-prefs") {
    return readBody(req).then((body) => json(saveDmPrefs(host.cwd, parseDmPrefsBody(body))));
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
        const invite = inviteTokenFrom(req, body);
        let humanId: string | undefined;
        if (invite) {
          const row = humanForToken(loadHumans(host.cwd), invite);
          if (!row) return json({ error: "invalid invite" }, 401);
          humanId = row.id;
        }
        const result = await sendDm(
          host,
          String(body.from ?? "human"),
          String(body.to ?? ""),
          String(body.text ?? ""),
          typeof body.threadId === "string" ? body.threadId : undefined,
          undefined,
          undefined,
          undefined,
          humanId,
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
  const cors = opts.cors?.trim() || undefined;
  const fetch = (req: Request) => {
    if (cors && req.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), cors);
    }
    return Promise.resolve(handleRequest(host, req, publicDir)).then((res) => withCors(res, cors));
  };
  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({ port: preferred, hostname, fetch, idleTimeout: 255 });
  } catch (err) {
    const busy =
      err instanceof Error &&
      (/EADDRINUSE/i.test(err.message) || /port .* in use/i.test(err.message));
    if (!busy || preferred === 0) throw err;
    server = Bun.serve({ port: 0, hostname, fetch, idleTimeout: 255 });
  }
  return { server, host, url: `http://${hostname}:${server.port}` };
}

if (import.meta.main) {
  const flags = parseServerArgv(flagsFromArgv(process.argv));
  const publicDir =
    flags.publicDir ??
    resolvePublicDir({
      execPath: process.execPath,
      importMetaDir: import.meta.dir,
    });
  const { url, host } = startServer({
    cwd: flags.cwd,
    port: flags.port,
    hostname: flags.hostname,
    publicDir,
    cors: flags.cors,
  });
  const writer = Bun.stdout.writer();
  writer.write(`crew ui  ${url}\n`);
  writer.flush();
  void attachDiscordHost(host).then((got) => {
    if (!got.started) return;
    writer.write("crew discord  attached\n");
    writer.flush();
  });
}
