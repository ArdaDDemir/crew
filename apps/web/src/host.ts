import { join } from "node:path";
import {
  dispatchChannelPost,
  dispatchDm,
  dmThreadId,
  type ChatEvent,
  type PermissionMode,
  type Provider,
  type Tool,
} from "@crew/core";
import { JsonlEventStore } from "@crew/store-jsonl";
import { FsWorkspace } from "@crew/workspace-fs";
import { OpenAICompatProvider } from "@crew/provider-openai";
import { nativeTools } from "@crew/tools-native";
import { defaultHome, mergeConfig } from "./config";

const MODES = new Set<PermissionMode>([
  "supervised",
  "auto-accept",
  "auto",
  "full-access",
]);

export type Host = {
  cwd: string;
  workspace: FsWorkspace;
  store: JsonlEventStore;
  tools: Tool[];
  model: string;
  cfg: ReturnType<typeof mergeConfig>;
  provider: Provider;
  live: boolean;
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
    workspace,
    store,
    tools,
    model,
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

export function snapshot(host: Host) {
  return {
    model: host.model,
    key: host.cfg.apiKey ? "set" : "missing",
    channels: host.workspace.listChannels().map((ch) => ({
      id: ch.id,
      leadBotId: ch.leadBotId ?? null,
      memberBotIds: ch.memberBotIds,
      permissionMode: ch.permissionMode,
    })),
    bots: host.workspace.listBots().map((b) => ({
      id: b.id,
      name: b.name,
      model: b.model ?? null,
    })),
    dms: host.store
      .listThreads()
      .filter((t) => t.kind === "dm")
      .map((t) => t.id),
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
        };
      }
      if (event.type === "error") {
        return {
          type: "error" as const,
          ts: event.ts,
          botId: String(event.payload.botId ?? ""),
          text: String(event.payload.message ?? ""),
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
) {
  const channel = host.workspace.getChannel(channelId);
  if (!channel) throw new Error(`unknown channel: ${channelId}`);
  return dispatchChannelPost({
    store: host.store,
    workspace: host.workspace,
    provider: host.provider,
    tools: host.tools,
    model: host.model,
    workspaceRoot: host.cwd,
    ask: async () => "allow",
    hasReviewer: false,
    turnGapMs: 0,
    rateLimitGapMs: host.live ? 8000 : 0,
    onEvent,
    onStatus,
    channelId,
    text,
    ...clock(),
  });
}

export async function sendDm(host: Host, from: string, to: string, text: string) {
  return dispatchDm({
    store: host.store,
    workspace: host.workspace,
    provider: host.provider,
    tools: host.tools,
    model: host.model,
    workspaceRoot: host.cwd,
    ask: async () => "allow",
    hasReviewer: false,
    turnGapMs: 0,
    rateLimitGapMs: 0,
    from: party(from),
    to: party(to),
    text,
    ...clock(),
  });
}

export function setMode(host: Host, channelId: string, mode: string) {
  if (!MODES.has(mode as PermissionMode)) {
    throw new Error("unknown mode");
  }
  host.workspace.setChannelMode(channelId, mode as PermissionMode);
  return { mode };
}

export { dmThreadId };
