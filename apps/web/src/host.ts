import { lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { sanitizeFolderHints } from "../public/workspace-path.js";
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
  humanAuthor,
  loadAlways,
  matchesAlways,
  rememberAlways,
  removeAlwaysRule,
  saveAlways,
  shortenChatError,
  summarizeThread,
  parseReviewerVerdict,
  type AskFn,
  type ChatEvent,
  type PermissionMode,
  type Provider,
  type ReviewFn,
  type Tool,
} from "@crew/core";
import { JsonlEventStore } from "@crew/store-jsonl";
import { FsWorkspace } from "@crew/workspace-fs";
import { OpenAICompatProvider } from "@crew/provider-openai";
import {
  DEFAULT_HARNESS_MODEL,
  HarnessCliProvider,
  shouldSpawnHarness,
  type CrewPermissionMode,
  type HarnessKind,
  type HarnessRunner,
} from "@crew/provider-harness";
import { lazyPlaywrightBrowser, nativeTools } from "@crew/tools-native";
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
import { dmModeOf, ensureDmMode, loadDmPrefs, saveDmPrefs, setDmMode } from "./dm-prefs";
import { loadMcp, parseMcpBody, saveMcp, writeHarnessMcpConfig, type McpFile, type McpServer } from "./mcp";
import { collectMcpSessions, type McpRpc } from "./mcp-client";
import {
  healthProviders,
  listAllProviderModels,
  listProviderCards,
  loadProviders,
  parseHarness,
  parseProvidersBody,
  saveProviders,
  whichBinary,
} from "./providers";
import { asUpdateUrl, checkCrewUpdate, effectiveUpdateFeed } from "./update";
import { CREW_VERSION } from "./version";

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
  grokRun?: HarnessRunner;
  harnessRun?: HarnessRunner;
  mcpConnect?: (server: McpServer) => McpRpc;
  onHumanDm?: (row: { humanId: string; text: string; threadId: string }) => Promise<void>;
  run?: {
    stopped: boolean;
    abort?: AbortController;
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
  grokRun?: HarnessRunner;
  harnessRun?: HarnessRunner;
  mcpConnect?: (server: McpServer) => McpRpc;
}): Host {
  const cwd = input.cwd;
  const home = input.home ?? defaultHome();
  const env = input.env ?? process.env;
  const cfg = mergeConfig({ cwd, home, env });
  const workspace = new FsWorkspace(join(cwd, ".crew"));
  const store = new JsonlEventStore(join(cwd, ".crew", "logs"));
  const tools =
    input.tools ??
    nativeTools({ browser: lazyPlaywrightBrowser(join(cwd, ".crew", "browser")) });
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
    grokRun: input.grokRun,
    harnessRun: input.harnessRun ?? input.grokRun,
    mcpConnect: input.mcpConnect,
  };
}

async function withMcpTools<T>(host: Host, fn: (tools: Tool[]) => Promise<T>): Promise<T> {
  const mcp = await collectMcpSessions({
    servers: loadMcp(host.cwd).servers,
    cwd: host.cwd,
    signal: host.run?.abort?.signal,
    connect: host.mcpConnect,
  });
  try {
    return await fn([...host.tools, ...mcp.tools]);
  } finally {
    await mcp.close();
  }
}

export function getMcp(host: Host): McpFile {
  return loadMcp(host.cwd);
}

export function putMcp(host: Host, body: unknown): McpFile {
  return saveMcp(host.cwd, parseMcpBody(body));
}

export async function listMcpTools(host: Host) {
  const mcp = await collectMcpSessions({
    servers: loadMcp(host.cwd).servers,
    cwd: host.cwd,
    connect: host.mcpConnect,
  });
  try {
    return {
      tools: mcp.tools.map((t) => ({
        name: t.name,
        description: t.description,
      })),
    };
  } finally {
    await mcp.close();
  }
}

function clock() {
  return {
    nextId: () => `evt_${crypto.randomUUID()}`,
    now: () => new Date().toISOString(),
  };
}

function party(token: string, humanId?: string) {
  if (token === "human" || token === "you") return humanAuthor(humanId);
  return { kind: "bot" as const, botId: token };
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
    version: CREW_VERSION,
    updateUrl: host.cfg.updateUrl ?? "",
    autoUpdate: host.cfg.autoUpdate !== false,
    model: host.model,
    keep: HISTORY_KEEP,
    fallbackModel: host.fallbackModel ?? "",
    models: allowedList(host),
    key: host.cfg.apiKey ? maskKey(host.cfg.apiKey) : "",
    keySet: Boolean(host.cfg.apiKey),
    cwd: host.cwd,
    baseUrl: host.cfg.baseUrl ?? "",
    defaultPermissionMode: host.cfg.defaultPermissionMode ?? "auto-accept",
    autoCompact: host.cfg.autoCompact !== false,
    reviewerModel: host.cfg.reviewerModel ?? "",
    defaultHarness: host.cfg.defaultHarness ?? null,
    defaultHarnessModel: host.cfg.defaultHarnessModel ?? null,
    providers: loadProviders(host.cwd),
    providerCards: listProviderCards(host.cwd),
    mcp: loadMcp(host.cwd),
    posted: postedCounts(host),
    channels: host.workspace.listChannels().map((ch) => ({
      id: ch.id,
      title: ch.title ?? ch.id,
      icon: ch.icon ?? "#",
      leadBotId: ch.leadBotId ?? null,
      memberBotIds: ch.memberBotIds,
      permissionMode: ch.permissionMode,
      brief: channelBrief(ch.context),
    })),
    bots: host.workspace.listBots().map((b) => ({
      id: b.id,
      name: b.name,
      model: b.model ?? null,
      fallbackModel: b.fallbackModel ?? null,
      icon: b.icon ?? null,
      harness: b.harness ?? null,
      harnessModel: b.harnessModel ?? null,
      effort: b.effort ?? null,
    })),
    dms: (() => {
      const prefs = loadDmPrefs(host.cwd);
      const gone = new Set(prefs.deleted);
      const archived = new Set(prefs.archived);
      return host.store
        .listThreads()
        .filter((t) => t.kind === "dm" && !gone.has(t.id))
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
            archived: archived.has(t.id),
            permissionMode: dmModeOf(prefs, t.id, "auto-accept"),
          };
        })
        .sort((x, y) => String(y.lastTs).localeCompare(String(x.lastTs)));
    })(),
  };
}

export function shotPathFromOutput(output: string): string | undefined {
  const m = String(output ?? "").match(/\.crew\/browser\/shots\/[A-Za-z0-9._-]+\.png/);
  return m?.[0];
}

export function shotFile(cwd: string, rel: string): string | undefined {
  const raw = String(rel ?? "").replaceAll("\\", "/").trim();
  if (!/^\.crew\/browser\/shots\/[A-Za-z0-9._-]+\.png$/.test(raw)) return undefined;
  return resolve(cwd, ...raw.split("/"));
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
      if (event.type === "tool.completed" && flags.verbose) {
        const output = String(event.payload.output ?? "");
        const shot = shotPathFromOutput(output);
        if (!shot) return null;
        return {
          type: "tool" as const,
          ts: event.ts,
          botId: String(event.payload.botId ?? ""),
          name: String(event.payload.name ?? ""),
          args: {},
          output,
          shot,
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
      if (event.type === "handoff.held") {
        return {
          type: "held" as const,
          ts: event.ts,
          text: String(event.payload.text ?? ""),
          waiting: Array.isArray(event.payload.waiting)
            ? event.payload.waiting.map((id) => String(id))
            : [],
        };
      }
      if (event.type === "mention.ignored") {
        return {
          type: "ignored" as const,
          ts: event.ts,
          text: String(event.payload.text ?? ""),
          ignored: Array.isArray(event.payload.ignored)
            ? event.payload.ignored.map((id) => String(id))
            : [],
        };
      }
      return null;
    })
    .filter(Boolean);
}

function harnessBind(host: Host, botId: string, mode: CrewPermissionMode) {
  if (!shouldSpawnHarness(mode)) return undefined;
  const bot = host.workspace.getBot(botId);
  const file = loadProviders(host.cwd);
  const kind = (bot?.harness || (!bot?.harness ? host.cfg.defaultHarness : "") || "") as string;
  if (kind !== "grok" && kind !== "claude" && kind !== "codex" && kind !== "opencode") return undefined;
  const slot = file[kind];
  if (!slot.enabled) return undefined;
  const fromBot = bot?.harness === kind;
  const binary = (slot.binary || "").trim() || whichBinary(kind) || kind;
  const model =
    (fromBot ? bot?.harnessModel : host.cfg.defaultHarnessModel)?.trim() ||
    DEFAULT_HARNESS_MODEL[kind as HarnessKind] ||
    kind;
  return {
    provider: new HarnessCliProvider({
      kind: kind as HarnessKind,
      binary,
      cwd: host.cwd,
      signal: host.run?.abort?.signal,
      run: host.harnessRun ?? host.grokRun,
      mode,
      mcpConfigPath: writeHarnessMcpConfig(host.cwd, loadMcp(host.cwd)),
    }),
    model,
    fallbackModel: undefined,
  };
}

export async function sayChannel(
  host: Host,
  channelId: string,
  text: string,
  onEvent?: (botId: string, event: ChatEvent) => void,
  onStatus?: (message: string) => void,
  onAsk?: (botId: string, tool: string, args: Record<string, unknown>) => void,
  humanId?: string,
  onToolDone?: (row: { botId: string; name: string; output: string }) => void,
) {
  const channel = host.workspace.getChannel(channelId);
  if (!channel) throw new Error(`unknown channel: ${channelId}`);
  host.run = { stopped: false, abort: new AbortController() };
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
    return await withMcpTools(host, (tools) =>
      dispatchChannelPost({
      store: host.store,
      workspace: host.workspace,
      provider: host.provider,
      providerForBot: (botId) =>
        harnessBind(host, botId, (channel.permissionMode as CrewPermissionMode) || "auto-accept"),
      permissionModeFor: (thread) => {
        if (thread.kind === "channel") return channel.permissionMode as PermissionMode;
        const existed = host.store.read(thread).length > 0;
        return rememberDmMode(host, thread.id, !existed);
      },
      tools,
      model: host.model,
      fallbackModel: host.fallbackModel,
      workspaceRoot: host.cwd,
      ask,
      ...bindReview(host),
      turnGapMs: 0,
      rateLimitGapMs: host.live ? 8000 : 0,
      shouldStop: () => {
        if (host.run?.stopped) host.run.abort?.abort();
        return Boolean(host.run?.stopped);
      },
      onEvent,
      onStatus,
      onToolDone,
      channelId,
      text,
      humanId,
      onHumanDm: host.onHumanDm,
      ...clock(),
    }),
    );
  } finally {
    host.run = undefined;
  }
}

export function stopRun(host: Host) {
  if (!host.run) return { stopped: false };
  host.run.stopped = true;
  host.run.abort?.abort();
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

export function addAlways(host: Host, tool: string, args: Record<string, unknown>) {
  const kind = tool.trim();
  if (kind !== "apply_patch" && kind !== "shell") {
    throw new Error("tool must be apply_patch or shell");
  }
  if (kind === "apply_patch" && !String(args.path ?? "").trim()) {
    throw new Error("path required");
  }
  if (kind === "shell" && !String(args.command ?? "").trim()) {
    throw new Error("command required");
  }
  const pick =
    kind === "apply_patch"
      ? { path: String(args.path).trim() }
      : { command: String(args.command).trim() };
  return { rules: rememberAlways(join(host.cwd, ".crew"), kind, pick) };
}

export function removeAlways(host: Host, tool: string, key: string) {
  if (!tool.trim() || !key.trim()) throw new Error("tool and key required");
  return { rules: removeAlwaysRule(join(host.cwd, ".crew"), tool.trim(), key) };
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
  const fallback = host.cfg.defaultPermissionMode ?? "auto-accept";
  const raw = (input.permissionMode?.trim() || fallback) as PermissionMode;
  const mode = MODES.has(raw) ? raw : fallback;
  host.workspace.addChannel({
    id,
    title: input.title?.trim() || id,
    leadBotId: lead,
    memberBotIds: members,
    permissionMode: mode,
    icon: input.icon,
    context: input.context,
    rules: input.rules,
    folders: input.folders !== undefined ? sanitizeFolderHints(input.folders, host.cwd) : undefined,
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
  onEvent?: (botId: string, event: ChatEvent) => void,
  onStatus?: (message: string) => void,
  onAsk?: (botId: string, tool: string, args: Record<string, unknown>) => void,
  humanId?: string,
  onToolDone?: (row: { botId: string; name: string; output: string }) => void,
) {
  const previous = host.run;
  host.run = { stopped: false, abort: new AbortController() };
  const fromParty = party(from, from === "human" || from === "you" ? humanId : undefined);
  const toParty = party(to, to === "human" || to === "you" ? humanId : undefined);
  const tid = threadId?.trim() || dmThreadId(fromParty, toParty);
  const existed = host.store.read({ kind: "dm", id: tid }).length > 0;
  const mode = rememberDmMode(host, tid, !existed);
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
  let result: Awaited<ReturnType<typeof dispatchDm>>;
  try {
    result = await withMcpTools(host, (tools) =>
      dispatchDm({
      store: host.store,
      workspace: host.workspace,
      provider: host.provider,
      providerForBot: (botId) => harnessBind(host, botId, mode),
      tools,
      model: host.model,
      fallbackModel: host.fallbackModel,
      workspaceRoot: host.cwd,
      ask,
      ...bindReview(host),
      turnGapMs: 0,
      rateLimitGapMs: host.live ? 8000 : 0,
      permissionModeFor: (thread) =>
        thread.kind === "dm" ? resolveThreadMode(host, "dm", thread.id) : undefined,
      shouldStop: () => {
        if (host.run?.stopped) host.run.abort?.abort();
        return Boolean(host.run?.stopped);
      },
      onEvent,
      onStatus,
      onToolDone,
      from: fromParty,
      to: toParty,
      text,
      threadId: threadId || undefined,
      ...clock(),
    }),
    );
  } finally {
    host.run = previous;
  }
  if (from === "human") {
    try {
      const parsed = parseDmThreadId(result.threadId);
      if (parsed.withHuman) {
        await titleThread(host, { kind: "dm", id: result.threadId }, { botId: parsed.right });
      }
    } catch {
      /* title is best-effort; the DM already posted */
    }
  }
  return result;
}

export async function regenerateTitle(host: Host, kind: "channel" | "dm", id: string) {
  if (!id) throw new Error("id required");
  const parsed = kind === "dm" ? parseDmThreadId(id) : null;
  const event = await titleThread(
    host,
    { kind, id },
    { force: true, botId: parsed?.withHuman ? parsed.right : undefined },
  );
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
  rememberDmMode(host, id, true);
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
  const id = channelId.trim();
  if (host.workspace.getChannel(id)) {
    host.workspace.setChannelMode(id, mode as PermissionMode);
    return { mode, kind: "channel" as const, id };
  }
  saveDmPrefs(host.cwd, setDmMode(loadDmPrefs(host.cwd), id, mode as PermissionMode));
  return { mode, kind: "dm" as const, id };
}

export function resolveThreadMode(host: Host, kind: "channel" | "dm", id: string): PermissionMode {
  if (kind === "channel") {
    return (host.workspace.getChannel(id)?.permissionMode as PermissionMode) || "auto-accept";
  }
  return dmModeOf(loadDmPrefs(host.cwd), id, "auto-accept");
}

async function collectReviewText(
  provider: Provider,
  model: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<string> {
  let text = "";
  for await (const ev of provider.complete({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are Crew's permission reviewer. Reply with one word: ALLOW, DENY, or ASK. ALLOW only if the tool is in-workspace, reversible, and on-task. DENY secrets or destructive. ASK if unsure. Never reply YES.",
      },
      { role: "user", content: `tool=${tool}\n${JSON.stringify(args)}` },
    ],
  })) {
    if (ev.type === "text-delta") text += ev.text;
  }
  return text;
}

function bindReview(host: Host): { hasReviewer: boolean; review?: ReviewFn } {
  const model = (host.cfg.reviewerModel ?? "").trim();
  if (!model) return { hasReviewer: false };
  return {
    hasReviewer: true,
    review: async ({ tool, args }) => {
      try {
        return parseReviewerVerdict(await collectReviewText(host.provider, model, tool, args));
      } catch {
        return "ask";
      }
    },
  };
}

function rememberDmMode(host: Host, id: string, isNew: boolean): PermissionMode {
  const prefs = loadDmPrefs(host.cwd);
  if (prefs.modes[id]) return prefs.modes[id]!;
  if (!isNew) return "auto-accept";
  const next = ensureDmMode(prefs, id, host.cfg.defaultPermissionMode ?? "auto-accept");
  saveDmPrefs(host.cwd, next);
  return dmModeOf(next, id, "auto-accept");
}

export function channelBrief(context?: string): string {
  const line =
    (context ?? "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean) ?? "";
  if (line.length <= 80) return line;
  return `${line.slice(0, 77)}…`;
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
    titleModel: bot.titleModel ?? "",
    harness: bot.harness ?? null,
    harnessModel: bot.harnessModel ?? null,
    effort: bot.effort ?? "",
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

export function setModel(
  host: Host,
  model: string,
  extra?: { harness?: string | null; harnessModel?: string | null },
) {
  if (extra?.harness) {
    const harness = parseHarness(extra.harness);
    if (!harness) throw new Error("unknown harness");
    const harnessModel = String(extra.harnessModel ?? "").trim();
    host.cfg.defaultHarness = harness;
    host.cfg.defaultHarnessModel = harnessModel;
    writeConfigFile(projectConfigPath(host.cwd), {
      defaultHarness: harness,
      defaultHarnessModel: harnessModel,
    });
    return { model: host.model, harness, harnessModel };
  }
  const id = model.trim();
  if (!id) throw new Error("model required");
  host.model = id;
  host.cfg.model = id;
  host.cfg.defaultHarness = null;
  host.cfg.defaultHarnessModel = null;
  writeConfigFile(projectConfigPath(host.cwd), {
    model: id,
    defaultHarness: null,
    defaultHarnessModel: null,
  });
  return { model: id, harness: null, harnessModel: "" };
}

export function setBaseUrl(host: Host, baseUrl: string) {
  const id = baseUrl.trim();
  host.cfg.baseUrl = id || undefined;
  writeConfigFile(projectConfigPath(host.cwd), { baseUrl: id || undefined });
  if (host.live && host.cfg.apiKey) {
    host.provider = new OpenAICompatProvider({ apiKey: host.cfg.apiKey, baseUrl: host.cfg.baseUrl });
  }
  catalogCache = { at: 0, models: [] };
  return { baseUrl: host.cfg.baseUrl ?? "" };
}

export function setDefaultPermissionMode(host: Host, mode: string) {
  if (!MODES.has(mode as PermissionMode)) throw new Error("unknown mode");
  host.cfg.defaultPermissionMode = mode as PermissionMode;
  writeConfigFile(projectConfigPath(host.cwd), { defaultPermissionMode: mode as PermissionMode });
  return { defaultPermissionMode: mode };
}

export function setAutoCompact(host: Host, on: boolean) {
  host.cfg.autoCompact = on;
  writeConfigFile(projectConfigPath(host.cwd), { autoCompact: on });
  return { autoCompact: on };
}

export function setReviewerModel(host: Host, model: string) {
  const id = model.trim();
  host.cfg.reviewerModel = id;
  writeConfigFile(projectConfigPath(host.cwd), { reviewerModel: id || undefined });
  return { reviewerModel: id };
}

export function setUpdateUrl(host: Host, raw: string) {
  const trimmed = String(raw ?? "").trim();
  const url = asUpdateUrl(trimmed);
  if (trimmed && !url) throw new Error("update url must be https (http only on localhost)");
  host.cfg.updateUrl = url || undefined;
  writeConfigFile(userConfigPath(host.home), { updateUrl: url });
  return { updateUrl: url };
}

export function setAutoUpdate(host: Host, raw: unknown) {
  const on = raw !== false;
  host.cfg.autoUpdate = on;
  writeConfigFile(userConfigPath(host.home), { autoUpdate: on });
  return { autoUpdate: on };
}

export async function updateInstall(
  host: Host,
  input: { url?: string },
  deps?: { fetchImpl?: typeof fetch; launch?: (file: string) => void },
): Promise<{ ok: boolean; path: string; bytes: number }> {
  const url = asUpdateUrl(String(input.url ?? ""));
  if (!url) throw new Error("https url required");
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  let name = "Crew-setup.exe";
  try {
    const fromPath = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    if (/^[\w.-]+$/.test(fromPath)) name = fromPath;
  } catch {
    /* keep default name */
  }
  const dir = join(tmpdir(), "crew-update");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  const buf = new Uint8Array(await res.arrayBuffer());
  writeFileSync(file, buf);
  const launch =
    deps?.launch ??
    ((f: string) => {
      const proc = Bun.spawn([f], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
      void proc.exited;
    });
  launch(file);
  return { ok: true, path: file, bytes: buf.byteLength };
}

export function checkHostUpdate(host: Host, fetchImpl: typeof fetch = fetch) {
  return checkCrewUpdate({
    current: CREW_VERSION,
    updateUrl: effectiveUpdateFeed(host.cfg.autoUpdate, host.cfg.updateUrl),
    fetchImpl,
  });
}

export function getProviders(host: Host) {
  return loadProviders(host.cwd);
}

export function putProviders(host: Host, body: Record<string, unknown>) {
  return saveProviders(host.cwd, parseProvidersBody(body));
}

export async function checkProviders(host: Host) {
  return { cards: await healthProviders(host.cwd) };
}

export async function listProviderModels(host: Host) {
  return listAllProviderModels(host.cwd, allowedList(host));
}

export { parseHarness };

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
  const visionModel = resolveJobModel(host, "vision", jobs.vision);
  if (visionModel) {
    const job = { model: visionModel, botId: jobs.vision.botId };
    for (const rel of paths) {
      if (!IMAGE_EXT.has(extname(rel).toLowerCase())) continue;
      try {
        const caption = await runJob(host, job, VISION_PROMPT, { image: rel });
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
