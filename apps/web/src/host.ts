import { lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import {
  assertBotId,
  assertSlug,
  dispatchChannelPost,
  dispatchDm,
  dmThreadId,
  HISTORY_KEEP,
  lastCompact,
  lastSummary,
  parseDmThreadId,
  loadAlways,
  matchesAlways,
  rememberAlways,
  saveAlways,
  shortenChatError,
  summarizeThread,
  type AskFn,
  type ChatEvent,
  type PermissionMode,
  type Provider,
  type Tool,
} from "@crew/core";
import { JsonlEventStore } from "@crew/store-jsonl";
import { FsWorkspace } from "@crew/workspace-fs";
import { OpenAICompatProvider } from "@crew/provider-openai";
import { nativeTools } from "@crew/tools-native";
import {
  defaultHome,
  maskKey,
  mergeConfig,
  projectConfigPath,
  userConfigPath,
  writeConfigFile,
} from "./config";
import {
  lastTitled,
  loadJobs,
  resolveJobModel,
  runJob,
  titleThread,
  VISION_PROMPT,
} from "./jobs";

const MODES = new Set<PermissionMode>([
  "supervised",
  "auto-accept",
  "auto",
  "full-access",
]);

export type Host = {
  cwd: string;
  home: string;
  workspace: FsWorkspace;
  store: JsonlEventStore;
  tools: Tool[];
  model: string;
  fallbackModel?: string;
  cfg: ReturnType<typeof mergeConfig>;
  provider: Provider;
  live: boolean;
  run?: {
    stopped: boolean;
    resolveAsk?: (decision: "allow" | "deny" | "always") => void;
    askTool?: string;
    askArgs?: Record<string, unknown>;
  };
};

export type CatalogModel = {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  prompt: string;
  completion: string;
  modality: string;
};

export function createHost(input: {
  cwd: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
  provider?: Provider;
  tools?: Tool[];
}): Host {
  const cwd = input.cwd;
  const home = input.home ?? defaultHome();
  const env = input.env ?? process.env;
  const cfg = mergeConfig({ cwd, home, env });
  const workspace = new FsWorkspace(join(cwd, ".crew"));
  const store = new JsonlEventStore(join(cwd, ".crew", "logs"));
  const tools = input.tools ?? nativeTools();
  const model = cfg.model ?? "z-ai/glm-5.3-flash";
  const provider =
    input.provider ??
    (cfg.apiKey
      ? new OpenAICompatProvider({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl })
      : undefined);
  if (!provider) {
    throw new Error("no API key: set OPENROUTER_API_KEY or crew config set key");
  }
  return {
    cwd,
    home,
    workspace,
    store,
    tools,
    model,
    fallbackModel: cfg.fallbackModel,
    cfg,
    provider,
    live: !input.provider,
  };
}

function clock() {
  return {
    nextId: () => `evt_${crypto.randomUUID()}`,
    now: () => new Date().toISOString(),
  };
}

function party(token: string) {
  return token === "human" ? ({ kind: "human" } as const) : { kind: "bot" as const, botId: token };
}

export const MODEL_PRESETS = [
  "z-ai/glm-5.3-flash",
  "z-ai/glm-5.2:free",
  "x-ai/grok-4",
  "x-ai/grok-3",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.7-sonnet",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemma-4-31b-it:free",
  "deepseek/deepseek-chat",
  "qwen/qwen3-235b-a22b",
];

function allowedList(host: Host): string[] {
  const listed = host.cfg.allowedModels?.filter(Boolean) ?? [];
  if (listed.length) return [...new Set(listed)];
  return [...new Set([host.model, ...MODEL_PRESETS])];
}

function postedCounts(host: Host): Record<string, number> {
  const out: Record<string, number> = {};
  for (const thread of host.store.listThreads()) {
    out[`${thread.kind}:${thread.id}`] = host.store
      .read(thread)
      .filter((e) => e.type === "message.posted").length;
  }
  return out;
}

export function watchPayload(host: Host) {
  const snap = snapshot(host);
  return {
    posted: snap.posted,
    dms: snap.dms.map((d) => ({ id: d.id, posted: d.posted, lastTs: d.lastTs })),
    botIds: snap.bots.map((b) => b.id),
    channelIds: snap.channels.map((c) => c.id),
  };
}

export async function compactThread(host: Host, kind: "channel" | "dm", id: string) {
  if (!id) throw new Error("id required");
  const jobs = loadJobs(host);
  const model = resolveJobModel(host, "compact", jobs.compact) ?? host.model;
  const botId = jobs.compact.botId;
  const soul = botId ? host.workspace.getBot(botId)?.soul : undefined;
  const event = await summarizeThread({
    store: host.store,
    thread: { kind, id },
    provider: host.provider,
    model,
    clock: clock(),
    botId,
    soul,
  });
  return {
    ok: true as const,
    summary: String(event.payload.text ?? ""),
    keptFrom: String(event.payload.keptFrom ?? ""),
    model: String(event.payload.model ?? ""),
  };
}

export function compactStatus(host: Host, kind: "channel" | "dm", id: string) {
  if (!id) throw new Error("id required");
  const events = host.store.read({ kind, id });
  const summary = lastSummary(events);
  const compacted = lastCompact(events);
  const times = [summary?.ts, compacted?.ts].filter((t): t is string => Boolean(t));
  times.sort();
  return {
    posted: events.filter((e) => e.type === "message.posted").length,
    keep: HISTORY_KEEP,
    hasSummary: Boolean(summary),
    lastCompactAt: times.at(-1) ?? null,
  };
}

export function snapshot(host: Host) {
  return {
    model: host.model,
    keep: HISTORY_KEEP,
    fallbackModel: host.fallbackModel ?? "",
    models: allowedList(host),
    key: host.cfg.apiKey ? maskKey(host.cfg.apiKey) : "",
    keySet: Boolean(host.cfg.apiKey),
    posted: postedCounts(host),
    channels: host.workspace.listChannels().map((ch) => ({
      id: ch.id,
      title: ch.title ?? ch.id,
      icon: ch.icon ?? "#",
      leadBotId: ch.leadBotId ?? null,
      memberBotIds: ch.memberBotIds,
      permissionMode: ch.permissionMode,
    })),
    bots: host.workspace.listBots().map((b) => ({
      id: b.id,
      name: b.name,
      model: b.model ?? null,
      fallbackModel: b.fallbackModel ?? null,
      icon: b.icon ?? null,
    })),
    dms: host.store
      .listThreads()
      .filter((t) => t.kind === "dm")
      .map((t) => {
        const events = host.store.read(t);
        const last = [...events].reverse().find((e) => e.type === "message.posted");
        const first = events.find((e) => e.type === "message.posted");
        const titled = lastTitled(events);
        const author = last?.payload.author as { kind?: string; botId?: string } | undefined;
        const parsed = parseDmThreadId(t.id);
        const raw = String(first?.payload.text ?? "").replace(/\s+/g, " ").trim();
        const gist = raw ? (raw.length > 42 ? `${raw.slice(0, 40)}…` : raw) : "New chat";
        const titledName = String(titled?.payload.title ?? "").trim();
        const title = titledName || gist;
        return {
          id: t.id,
          withHuman: parsed.withHuman,
          a: parsed.withHuman ? "you" : parsed.left,
          b: parsed.right,
          peerId: parsed.withHuman ? parsed.right : parsed.pair,
          conv: parsed.conv,
          title,
          description: String(titled?.payload.description ?? ""),
          lastText: String(last?.payload.text ?? ""),
          lastWho: author?.kind === "human" ? "you" : author?.botId ?? null,
          lastTs: last?.ts ?? events[events.length - 1]?.ts ?? "",
          posted: events.filter((e) => e.type === "message.posted").length,
        };
      })
      .sort((x, y) => String(y.lastTs).localeCompare(String(x.lastTs))),
  };
}

export function readThread(
  host: Host,
  kind: "channel" | "dm",
  id: string,
  flags: { thinking: boolean; verbose: boolean },
) {
  const events = host.store.read({ kind, id });
  return events
    .map((event) => {
      if (event.type === "message.posted") {
        const author = event.payload.author as { kind?: string; botId?: string };
        return {
          type: "message" as const,
          ts: event.ts,
          who: author?.kind === "human" ? "you" : `@${author?.botId ?? "bot"}`,
          botId: author?.botId ?? null,
          text: String(event.payload.text ?? ""),
        };
      }
      if (event.type === "assistant.reasoning" && flags.thinking) {
        return {
          type: "thinking" as const,
          ts: event.ts,
          botId: String(event.payload.botId ?? ""),
          text: String(event.payload.text ?? ""),
        };
      }
      if (event.type === "tool.requested" && flags.verbose) {
        return {
          type: "tool" as const,
          ts: event.ts,
          botId: String(event.payload.botId ?? ""),
          name: String(event.payload.name ?? ""),
          args: (event.payload.args as Record<string, unknown>) ?? {},
        };
      }
      if (event.type === "error") {
        return {
          type: "error" as const,
          ts: event.ts,
          botId: String(event.payload.botId ?? ""),
          text: shortenChatError(String(event.payload.message ?? "")),
        };
      }
      return null;
    })
    .filter(Boolean);
}

export async function sayChannel(
  host: Host,
  channelId: string,
  text: string,
  onEvent?: (botId: string, event: ChatEvent) => void,
  onStatus?: (message: string) => void,
  onAsk?: (botId: string, tool: string, args: Record<string, unknown>) => void,
) {
  const channel = host.workspace.getChannel(channelId);
  if (!channel) throw new Error(`unknown channel: ${channelId}`);
  host.run = { stopped: false };
  const crewDir = join(host.cwd, ".crew");
  const ask: AskFn = async ({ tool, args, botId }) => {
    if (host.run?.stopped) return "deny";
    if (!host.live) return "allow";
    if (matchesAlways(loadAlways(crewDir), tool, args)) return "allow";
    return await new Promise<"allow" | "deny" | "always">((resolve) => {
      if (host.run) {
        host.run.resolveAsk = resolve;
        host.run.askTool = tool;
        host.run.askArgs = args;
      }
      onAsk?.(botId ?? "", tool, args);
    });
  };
  try {
    return await dispatchChannelPost({
      store: host.store,
      workspace: host.workspace,
      provider: host.provider,
      tools: host.tools,
      model: host.model,
      fallbackModel: host.fallbackModel,
      workspaceRoot: host.cwd,
      ask,
      hasReviewer: false,
      turnGapMs: 0,
      rateLimitGapMs: host.live ? 8000 : 0,
      shouldStop: () => Boolean(host.run?.stopped),
      onEvent,
      onStatus,
      channelId,
      text,
      ...clock(),
    });
  } finally {
    host.run = undefined;
  }
}

export function stopRun(host: Host) {
  if (!host.run) return { stopped: false };
  host.run.stopped = true;
  host.run.resolveAsk?.("deny");
  host.run.resolveAsk = undefined;
  return { stopped: true };
}

export function resolveAsk(
  host: Host,
  decision: string,
  extra?: { tool?: string; args?: Record<string, unknown> },
) {
  if (decision !== "allow" && decision !== "deny" && decision !== "always") {
    throw new Error("decision must be allow, deny, or always");
  }
  if (!host.run?.resolveAsk) throw new Error("no permission pending");
  if (decision === "always") {
    const tool = extra?.tool || host.run.askTool;
    const args = extra?.args ?? host.run.askArgs ?? {};
    if (tool) rememberAlways(join(host.cwd, ".crew"), tool, args);
  }
  host.run.resolveAsk(decision);
  host.run.resolveAsk = undefined;
  return { decision };
}

export function listAlways(host: Host) {
  return { rules: loadAlways(join(host.cwd, ".crew")) };
}

export function clearAlways(host: Host) {
  saveAlways(join(host.cwd, ".crew"), []);
  return { rules: [] };
}

export function createBot(
  host: Host,
  input: { id: string; name: string; soul?: string; icon?: string; channelId?: string },
) {
  const id = input.id.trim();
  assertBotId(id);
  host.workspace.addBot({
    id,
    name: input.name.trim() || id,
    soul: input.soul,
    icon: input.icon,
  });
  const channelId = input.channelId;
  if (channelId) {
    const ch = host.workspace.getChannel(channelId);
    if (ch && !ch.memberBotIds.includes(id)) {
      host.workspace.updateChannel(channelId, {
        memberBotIds: [...ch.memberBotIds, id],
      });
    }
  }
  return botDetail(host, id);
}

export function createChannel(
  host: Host,
  input: {
    id: string;
    title?: string;
    leadBotId?: string;
    memberBotIds?: string[];
    icon?: string;
    permissionMode?: string;
    context?: string;
    rules?: string;
    folders?: string[];
  },
) {
  const id = input.id.trim();
  assertSlug(id);
  const bots = host.workspace.listBots().map((b) => b.id);
  const members = input.memberBotIds?.length ? input.memberBotIds : bots;
  const lead = input.leadBotId && members.includes(input.leadBotId) ? input.leadBotId : members[0];
  const mode = MODES.has(input.permissionMode as PermissionMode)
    ? (input.permissionMode as PermissionMode)
    : "auto-accept";
  host.workspace.addChannel({
    id,
    title: input.title?.trim() || id,
    leadBotId: lead,
    memberBotIds: members,
    permissionMode: mode,
    icon: input.icon,
    context: input.context,
    rules: input.rules,
    folders: input.folders,
  });
  return channelDetail(host, id);
}

export function removeBot(host: Host, id: string) {
  host.workspace.removeBot(id);
  return { ok: true, id };
}

export function removeChannel(host: Host, id: string) {
  host.workspace.removeChannel(id);
  return { ok: true, id };
}

export function skillDetail(host: Host, botId: string, name: string) {
  const skill = host.workspace.getSkill(botId, name);
  if (!skill) throw new Error(`unknown skill: ${botId}/${name}`);
  return skill;
}

export function fileTouchLabel(tool: string, args: Record<string, unknown>): string {
  if (typeof args.path === "string" && args.path.trim()) return args.path.trim();
  if (typeof args.command === "string") {
    const cmd = args.command.replace(/\s+/g, " ").trim();
    const file = cmd.match(/(?:^|[\s'"=])([A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,12})\b/);
    if (file?.[1]) return file[1];
    return cmd.length > 64 ? `${cmd.slice(0, 64)}…` : cmd;
  }
  return "";
}

const SNIPPET_MAX_LINES = 20;

export type DiffRow = {
  path: string;
  botId: string;
  ts: string;
  tool: string;
  snippet?: string;
};

export function patchSnippet(path: string, oldText: string, newText: string): string | undefined {
  if (oldText === newText) return undefined;
  const body: string[] = [];
  if (oldText !== "") {
    for (const line of oldText.split("\n")) body.push(`-${line}`);
  }
  if (newText !== "") {
    for (const line of newText.split("\n")) body.push(`+${line}`);
  }
  if (!body.length) return undefined;
  const lines = [`--- a/${path}`, `+++ b/${path}`, "@@", ...body];
  if (lines.length > SNIPPET_MAX_LINES) {
    return [...lines.slice(0, SNIPPET_MAX_LINES - 1), "…"].join("\n");
  }
  return lines.join("\n");
}

function applyPatchSnippet(tool: string, args: Record<string, unknown>, path: string): string | undefined {
  if (tool !== "apply_patch") return undefined;
  if (typeof args.old_text !== "string" || typeof args.new_text !== "string") return undefined;
  return patchSnippet(path, args.old_text, args.new_text);
}

export function threadDiff(host: Host, kind: "channel" | "dm", id: string): DiffRow[] {
  const events = host.store.read({ kind, id });
  const out: DiffRow[] = [];
  const index = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "tool.requested") continue;
    const tool = String(event.payload.name ?? "");
    const args = (event.payload.args ?? {}) as Record<string, unknown>;
    const path = fileTouchLabel(tool, args);
    if (!path) continue;
    const snippet = applyPatchSnippet(tool, args, path);
    const at = index.get(path);
    if (at !== undefined) {
      if (snippet === undefined) continue;
      const row = out[at];
      row.tool = tool;
      row.botId = String(event.payload.botId ?? "");
      row.ts = event.ts;
      row.snippet = snippet;
      continue;
    }
    index.set(path, out.length);
    const row: DiffRow = {
      path,
      botId: String(event.payload.botId ?? ""),
      ts: event.ts,
      tool,
    };
    if (snippet !== undefined) row.snippet = snippet;
    out.push(row);
  }
  return out;
}

export async function sendDm(
  host: Host,
  from: string,
  to: string,
  text: string,
  threadId?: string,
) {
  const result = await dispatchDm({
    store: host.store,
    workspace: host.workspace,
    provider: host.provider,
    tools: host.tools,
    model: host.model,
    fallbackModel: host.fallbackModel,
    workspaceRoot: host.cwd,
    ask: async () => "allow",
    hasReviewer: false,
    turnGapMs: 0,
    rateLimitGapMs: 0,
    from: party(from),
    to: party(to),
    text,
    threadId: threadId || undefined,
    ...clock(),
  });
  if (from === "human") {
    try {
      const parsed = parseDmThreadId(result.threadId);
      if (parsed.withHuman) {
        await titleThread(host, { kind: "dm", id: result.threadId });
      }
    } catch {
      /* title is best-effort; the DM already posted */
    }
  }
  return result;
}

export async function regenerateTitle(host: Host, kind: "channel" | "dm", id: string) {
  if (!id) throw new Error("id required");
  const event = await titleThread(host, { kind, id }, { force: true });
  return {
    ok: true as const,
    title: String(event.payload.title ?? ""),
    description: String(event.payload.description ?? ""),
    model: String(event.payload.model ?? ""),
  };
}

export function openDmChat(host: Host, to: string) {
  assertBotId(to);
  if (!host.workspace.getBot(to)) throw new Error(`unknown bot: ${to}`);
  const conv = `t${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  assertSlug(conv);
  const id = `${dmThreadId({ kind: "human" }, { kind: "bot", botId: to })}__${conv}`;
  const { nextId, now } = clock();
  host.store.append({
    v: 1,
    id: nextId(),
    ts: now(),
    thread: { kind: "dm", id },
    type: "dm.opened",
    parent: null,
    payload: {
      participants: [{ kind: "human" }, { kind: "bot", botId: to }],
    },
  });
  return { id };
}

export function setMode(host: Host, channelId: string, mode: string) {
  if (!MODES.has(mode as PermissionMode)) {
    throw new Error("unknown mode");
  }
  host.workspace.setChannelMode(channelId, mode as PermissionMode);
  return { mode };
}

export function channelDetail(host: Host, id: string) {
  const ch = host.workspace.getChannel(id);
  if (!ch) throw new Error(`unknown channel: ${id}`);
  return {
    id: ch.id,
    title: ch.title ?? ch.id,
    icon: ch.icon ?? "#",
    leadBotId: ch.leadBotId ?? null,
    memberBotIds: ch.memberBotIds,
    permissionMode: ch.permissionMode,
    rules: ch.rules ?? "",
    context: ch.context ?? "",
    folders: ch.folders ?? [],
  };
}

export function botDetail(host: Host, id: string) {
  const bot = host.workspace.getBot(id);
  if (!bot) throw new Error(`unknown bot: ${id}`);
  return {
    id: bot.id,
    name: bot.name,
    icon: bot.icon ?? "",
    model: bot.model ?? "",
    soul: bot.soul ?? "",
    standingOrders: bot.standingOrders ?? "",
    skills: bot.skills ?? [],
    fallbackModel: bot.fallbackModel ?? "",
  };
}

function priceLabel(raw: string | undefined): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "free";
  const perM = n * 1e6;
  if (perM < 0.01) return `$${perM.toFixed(4)}/M`;
  return `$${perM.toFixed(2)}/M`;
}

let catalogCache: { at: number; models: CatalogModel[] } = { at: 0, models: [] };

export function resetCatalogCache() {
  catalogCache = { at: 0, models: [] };
}

export async function listCatalog(
  host: Host,
  query = "",
  fetchImpl: typeof fetch = fetch,
): Promise<CatalogModel[]> {
  const now = Date.now();
  if (!catalogCache.models.length || now - catalogCache.at > 10 * 60 * 1000) {
    const key = host.cfg.apiKey;
    if (!key) throw new Error("no API key");
    const base = (host.cfg.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    const res = await fetchImpl(`${base}/models`, {
      headers: {
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://crew.local",
        "X-Title": "Crew",
      },
    });
    if (!res.ok) throw new Error(`openrouter models: ${res.status}`);
    const json = (await res.json()) as {
      data?: Array<{
        id?: string;
        name?: string;
        description?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
        architecture?: { modality?: string };
      }>;
    };
    catalogCache = {
      at: now,
      models: (json.data ?? [])
        .filter((row) => row.id)
        .map((row) => ({
          id: String(row.id),
          name: String(row.name ?? row.id),
          description: String(row.description ?? ""),
          contextLength: Number(row.context_length ?? 0),
          prompt: priceLabel(row.pricing?.prompt),
          completion: priceLabel(row.pricing?.completion),
          modality: String(row.architecture?.modality ?? "text"),
        })),
    };
  }
  const q = query.trim().toLowerCase();
  const list = q
    ? catalogCache.models.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q),
      )
    : catalogCache.models;
  return list.slice(0, 80);
}

export function setApiKey(host: Host, key: string) {
  const id = key.trim();
  if (!id) throw new Error("key required");
  host.cfg.apiKey = id;
  writeConfigFile(userConfigPath(host.home), { apiKey: id });
  if (host.live) {
    host.provider = new OpenAICompatProvider({ apiKey: id, baseUrl: host.cfg.baseUrl });
  }
  catalogCache = { at: 0, models: [] };
  return { key: maskKey(id), keySet: true };
}

export function setAllowedModels(host: Host, ids: string[]) {
  const allowed = [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
  host.cfg.allowedModels = allowed;
  writeConfigFile(projectConfigPath(host.cwd), { allowedModels: allowed });
  return { models: allowedList(host) };
}

export function setFallbackModel(host: Host, model: string) {
  const id = model.trim();
  host.fallbackModel = id || undefined;
  host.cfg.fallbackModel = id || undefined;
  writeConfigFile(projectConfigPath(host.cwd), { fallbackModel: id || undefined });
  return { fallbackModel: host.fallbackModel ?? "" };
}

export function setModel(host: Host, model: string) {
  const id = model.trim();
  if (!id) throw new Error("model required");
  host.model = id;
  host.cfg.model = id;
  writeConfigFile(projectConfigPath(host.cwd), { model: id });
  return { model: id };
}

const ATTACH_MAX = 8 * 1024 * 1024;
const ATTACH_COUNT = 32;

function inboxRel(raw: string): string {
  const n = raw.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!n) throw new Error("path required");
  const parts = n.split("/").filter(Boolean);
  if (!parts.length || parts.some((p) => p === "." || p === "..")) {
    throw new Error("bad path");
  }
  const safe = parts.map((p) => p.replace(/[^\w.\-]+/g, "_")).filter(Boolean);
  if (!safe.length) throw new Error("bad path");
  const rel = join("inbox", ...safe);
  if (/(^|[\\/])\.env($|\.)/i.test(rel) || rel.toLowerCase().includes(".ssh")) {
    throw new Error("that path is blocked");
  }
  return rel.replace(/\\/g, "/");
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export async function attachFiles(
  host: Host,
  files: { path: string; content: string }[],
): Promise<{ paths: string[]; captions: Record<string, string> }> {
  if (!Array.isArray(files) || !files.length) throw new Error("files required");
  if (files.length > ATTACH_COUNT) throw new Error(`max ${ATTACH_COUNT} files`);
  const root = resolve(host.cwd);
  const paths: string[] = [];
  for (const f of files) {
    const rel = inboxRel(String(f.path ?? ""));
    const buf = Buffer.from(String(f.content ?? ""), "base64");
    if (buf.length > ATTACH_MAX) throw new Error(`${rel} is too large`);
    const abs = resolve(root, rel);
    const inside = relative(root, abs);
    if (!inside || inside.startsWith("..") || isAbsolute(inside)) {
      throw new Error("bad path");
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, buf);
    paths.push(rel);
  }
  const captions: Record<string, string> = {};
  const jobs = loadJobs(host);
  if (resolveJobModel(host, "vision", jobs.vision)) {
    for (const rel of paths) {
      if (!IMAGE_EXT.has(extname(rel).toLowerCase())) continue;
      try {
        const caption = await runJob(host, jobs.vision, VISION_PROMPT, { image: rel });
        if (caption) captions[rel] = caption.replace(/\s+/g, " ").trim();
      } catch {
        /* path-only on vision failure */
      }
    }
  }
  return { paths, captions };
}

const PATH_SKIP_DIR = new Set([
  ".git",
  "node_modules",
  ".crew",
  "dist",
  "build",
  ".superpowers",
]);
const PATH_SKIP_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".exe",
  ".dll",
  ".bin",
  ".woff",
  ".woff2",
  ".zip",
]);

function posixInside(root: string, abs: string): string | null {
  const rel = relative(root, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.replace(/\\/g, "/");
}

function blockedRel(rel: string): boolean {
  const parts = rel.split("/").filter(Boolean);
  for (const part of parts) {
    if (part === ".ssh" || part === ".env") return true;
    if (PATH_SKIP_DIR.has(part)) return true;
  }
  const base = parts[parts.length - 1] ?? "";
  return base === ".env" || base.startsWith(".env.");
}

export function listPaths(host: Host, q: string): { paths: string[] } {
  const query = String(q ?? "").trim();
  if (!query) return { paths: [] };
  const needle = query.toLowerCase();
  const root = resolve(host.cwd);
  const found: string[] = [];
  const seen = new Set<string>();

  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const abs = join(dir, name);
      const listed = posixInside(root, abs);
      if (!listed) continue;
      if (blockedRel(listed)) continue;

      let st;
      try {
        st = lstatSync(abs);
      } catch {
        continue;
      }
      let target = abs;
      if (st.isSymbolicLink()) {
        try {
          target = realpathSync(abs);
        } catch {
          continue;
        }
        try {
          st = lstatSync(target);
        } catch {
          continue;
        }
      }
      const targetRel = posixInside(root, target);
      if (!targetRel || blockedRel(targetRel)) continue;
      if (seen.has(target)) continue;
      if (st.isDirectory()) {
        seen.add(target);
        walk(abs, depth + 1);
        continue;
      }
      if (!st.isFile()) continue;
      seen.add(target);
      const dot = name.lastIndexOf(".");
      if (dot >= 0 && PATH_SKIP_EXT.has(name.slice(dot).toLowerCase())) continue;
      if (listed.toLowerCase().includes(needle)) found.push(listed);
    }
  };

  walk(root, 0);
  found.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return { paths: found.slice(0, 50) };
}

export { dmThreadId };
