import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";
import { stdin as stdinStream, stdout as stdoutStream } from "node:process";
import { join } from "node:path";
import {
  dispatchChannelPost,
  dispatchDm,
  dmThreadId,
  type AskFn,
  type Participant,
  type PermissionMode,
  type ChatEvent,
  type CrewEvent,
  type Provider,
  type Tool,
  loadAlways,
  matchesAlways,
  parseReviewerVerdict,
  rememberAlways,
  type ReviewFn,
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
import { nativeTools } from "@crew/tools-native";
import { loadMcp, writeHarnessMcpConfig, type McpServer } from "../../web/src/mcp";
import { collectMcpSessions, type McpRpc } from "../../web/src/mcp-client";
import { loadProviders, whichBinary } from "../../web/src/providers";
import { dmModeOf, ensureDmMode, loadDmPrefs, saveDmPrefs, setDmMode } from "../../web/src/dm-prefs";
import {
  defaultHome,
  maskKey,
  mergeConfig,
  projectConfigPath,
  userConfigPath,
  writeConfigFile,
} from "./config";

function setThreadMode(
  cwd: string,
  workspace: FsWorkspace,
  id: string,
  mode: PermissionMode,
): "channel" | "dm" {
  if (workspace.getChannel(id)) {
    workspace.setChannelMode(id, mode);
    return "channel";
  }
  saveDmPrefs(cwd, setDmMode(loadDmPrefs(cwd), id, mode));
  return "dm";
}

const MODES = new Set<PermissionMode>([
  "supervised",
  "auto-accept",
  "auto",
  "full-access",
]);

export type Io = {
  cwd: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
  writeOut: (s: string) => void;
  writeErr: (s: string) => void;
  readLine?: () => Promise<string | null>;
};

export type CliDeps = {
  provider?: Provider;
  tools?: Tool[];
  ask?: AskFn;
  model?: string;
  harnessRun?: HarnessRunner;
  mcpConnect?: (server: McpServer) => McpRpc;
};

function crewRoot(cwd: string): string {
  return join(cwd, ".crew");
}

function parseFlags(args: string[]): {
  flags: Record<string, string>;
  positional: string[];
} {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token.startsWith("--")) {
      flags[token.slice(2)] = args[i + 1] ?? "";
      i += 1;
    } else {
      positional.push(token);
    }
  }
  return { flags, positional };
}

function party(token: string): Participant {
  return token === "human" ? { kind: "human" } : { kind: "bot", botId: token };
}

function clock() {
  return {
    nextId: () => `evt_${crypto.randomUUID()}`,
    now: () => new Date().toISOString(),
  };
}

function wokeLine(woken: string[]): string {
  return `woke: ${woken.length ? woken.join(", ") : "(none)"}\n`;
}

function printThread(
  io: Io,
  events: CrewEvent[],
  flags: { thinking: boolean; verbose: boolean },
): void {
  if (events.length === 0) {
    io.writeOut("(empty)\n");
    return;
  }
  for (const event of events) {
    if (event.type === "message.posted") {
      const author = event.payload.author as { kind?: string; botId?: string };
      const who = author?.kind === "human" ? "you" : `@${author?.botId ?? "bot"}`;
      io.writeOut(`${who}: ${String(event.payload.text ?? "")}\n\n`);
    } else if (event.type === "assistant.reasoning" && flags.thinking) {
      io.writeOut(
        `  [${event.payload.botId} thinking]\n${String(event.payload.text ?? "")}\n\n`,
      );
    } else if (event.type === "error") {
      io.writeErr(
        `ERROR ${event.payload.botId ?? ""}: ${String(event.payload.message ?? "")}\n`,
      );
    } else if (event.type === "tool.requested" && flags.verbose) {
      io.writeOut(`  [${event.payload.botId} tool] ${event.payload.name}\n`);
    }
  }
}

function printReplies(
  io: Io,
  replies: { botId: string; text: string; error?: string }[],
): void {
  for (const reply of replies) {
    if (reply.error) {
      io.writeErr(`${reply.botId} ERROR: ${reply.error}\n`);
      continue;
    }
    if (!reply.text.trim()) {
      io.writeErr(`${reply.botId} ERROR: empty reply (model returned no text)\n`);
      continue;
    }
    io.writeOut(`${reply.botId}: ${reply.text}\n`);
  }
}

function liveIo(io: Io, flags: { thinking: boolean; verbose: boolean }) {
  const started = new Set<string>();
  const thinking = new Set<string>();
  return {
    onStatus(message: string) {
      io.writeOut(`→ ${message}\n`);
    },
    onEvent(botId: string, event: ChatEvent) {
      if (event.type === "reasoning-delta") {
        if (!flags.thinking) return;
        if (!thinking.has(botId)) {
          io.writeOut(`  [${botId} thinking] `);
          thinking.add(botId);
        }
        io.writeOut(event.text);
        return;
      }
      if (event.type === "text-delta") {
        if (thinking.has(botId)) {
          io.writeOut("\n");
          thinking.delete(botId);
        }
        if (!started.has(botId)) {
          io.writeOut(`${botId}: `);
          started.add(botId);
        }
        io.writeOut(event.text);
        return;
      }
      if (event.type === "tool-call") {
        if (flags.verbose) io.writeOut(`\n  [${botId} tool] ${event.name}\n`);
        return;
      }
      if (event.type === "error") {
        io.writeErr(`\n${botId} ERROR: ${event.message}\n`);
        return;
      }
      if (event.type === "done") {
        if (thinking.has(botId)) io.writeOut("\n");
        if (started.has(botId)) io.writeOut("\n");
        thinking.delete(botId);
      }
    },
  };
}

function resolveProvider(
  deps: CliDeps,
  cfg: { apiKey?: string; baseUrl?: string },
): Provider {
  if (deps.provider) return deps.provider;
  if (!cfg.apiKey) {
    throw new Error(
      "no API key: run  crew config set key <OPENROUTER_KEY>  or set OPENROUTER_API_KEY",
    );
  }
  return new OpenAICompatProvider({
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
  });
}

function bindHarness(
  cwd: string,
  workspace: FsWorkspace,
  botId: string,
  mode: CrewPermissionMode,
  deps: CliDeps,
) {
  if (!shouldSpawnHarness(mode)) return undefined;
  const bot = workspace.getBot(botId);
  const file = loadProviders(cwd);
  const kind = (bot?.harness || "") as string;
  if (kind !== "grok" && kind !== "claude" && kind !== "codex" && kind !== "opencode") return undefined;
  const slot = file[kind];
  if (!slot.enabled) return undefined;
  const binary = (slot.binary || "").trim() || whichBinary(kind) || kind;
  const model = bot?.harnessModel?.trim() || DEFAULT_HARNESS_MODEL[kind as HarnessKind] || kind;
  return {
    provider: new HarnessCliProvider({
      kind: kind as HarnessKind,
      binary,
      cwd,
      run: deps.harnessRun,
      mode,
      mcpConfigPath: writeHarnessMcpConfig(cwd, loadMcp(cwd)),
    }),
    model,
    fallbackModel: undefined,
  };
}

const USAGE = `crew — local multi-bot CLI
  crew bot create <id> [--name TEXT] [--model ID] [--soul FILE] [--icon TEXT]
  crew bot update <id> [--name TEXT] [--model ID] [--fallback ID] [--soul FILE] [--orders FILE] [--icon TEXT]
  crew bot show <id>
  crew bot list
  crew skill list [bot]
  crew skill show <bot> <name>
  crew skill add <bot> --name N --desc D [--body FILE]
  crew skill rm <bot> <name>
  crew skill copy <fromBot> <name> <toBot>
  crew channel create <id> --bots a,b [--lead id]
  crew channel list|show <id>
  crew mode <channel|dmId> <supervised|auto-accept|auto|full-access>
  crew say <channel> <text> [--thinking] [--verbose]
  crew dm <from> <to> <text>
  crew dms
  crew dms show <a> <b>
  crew open <channel>     (/thinking /verbose /mode /stop /quit)
  crew log <channel> [--thinking] [--verbose]
  crew config set model|fallback|key|base-url|allowed <value>
  crew config show
  --yes   allow asked tools this process
  --thinking   stream thoughts (desk). default: crew log --thinking
  --verbose    stream tool names (desk). default: crew log --verbose
Env (overrides file): OPENROUTER_API_KEY  CREW_MODEL  CREW_BASE_URL
`;

function readOptionalFile(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return readFileSync(path, "utf8");
}

function defaultAsk(io: Io, yes: boolean): AskFn {
  const root = join(io.cwd, ".crew");
  return async ({ tool, args }) => {
    if (yes) return "allow";
    if (matchesAlways(loadAlways(root), tool, args)) return "allow";
    if (!io.readLine) return "deny";
    io.writeOut(
      `allow ${tool} ${JSON.stringify(args).slice(0, 200)}? [y/N/always] `,
    );
    const answer = (await io.readLine())?.trim().toLowerCase() ?? "n";
    if (answer === "always") {
      rememberAlways(root, tool, args);
      return "always";
    }
    if (answer === "y" || answer === "yes") return "allow";
    return "deny";
  };
}

async function defaultReadLine(): Promise<string | null> {
  const rl = createInterface({ input: stdinStream, output: stdoutStream });
  try {
    const line = await rl.question("> ");
    return line;
  } finally {
    rl.close();
  }
}

export async function runCli(
  argv: string[],
  io: Io,
  deps: CliDeps = {},
): Promise<number> {
  const yes = argv.includes("--yes");
  const globalFlag = argv.includes("--global");
  const showThinking = argv.includes("--thinking");
  const verbose = argv.includes("--verbose");
  argv = argv.filter(
    (a) =>
      a !== "--yes" &&
      a !== "--global" &&
      a !== "--thinking" &&
      a !== "--verbose",
  );
  const [cmd, sub, ...rest] = argv;
  const root = crewRoot(io.cwd);
  const workspace = new FsWorkspace(root);
  const store = new JsonlEventStore(join(root, "logs"));
  const tools = deps.tools ?? nativeTools();
  const home = io.home ?? defaultHome();
  const env = io.env ?? process.env;
  const cfg = mergeConfig({ cwd: io.cwd, home, env });
  const model = deps.model ?? cfg.model ?? "z-ai/glm-5.3-flash";
  const ask = deps.ask ?? defaultAsk(io, yes);
  const liveFlags = { thinking: showThinking, verbose };

  const halt = { stopped: false };
  const dispatchBase = () => ({
    store,
    workspace,
    provider: resolveProvider(deps, cfg),
    tools,
    model,
    workspaceRoot: io.cwd,
    ask,
    permissionModeFor: (thread: { kind: "channel" | "dm"; id: string }) => {
      if (thread.kind === "channel") return workspace.getChannel(thread.id)?.permissionMode;
      return dmModeOf(loadDmPrefs(io.cwd), thread.id, "auto-accept");
    },
    hasReviewer: Boolean((cfg.reviewerModel ?? "").trim()),
    review: (cfg.reviewerModel ?? "").trim()
      ? (async ({ tool, args }) => {
          try {
            const provider = resolveProvider(deps, cfg);
            let text = "";
            for await (const ev of provider.complete({
              model: cfg.reviewerModel!.trim(),
              messages: [
                {
                  role: "system",
                  content:
                    "You are Crew's permission reviewer. Reply with one word: ALLOW, DENY, or ASK. ALLOW = routine and safe. DENY = secrets or destructive. ASK = the human must decide.",
                },
                { role: "user", content: `tool=${tool}\n${JSON.stringify(args)}` },
              ],
            })) {
              if (ev.type === "text-delta") text += ev.text;
            }
            return parseReviewerVerdict(text);
          } catch {
            return "ask";
          }
        }) satisfies ReviewFn
      : undefined,
    shouldStop: () => halt.stopped,
    turnGapMs: deps.provider ? 0 : Number(process.env.CREW_TURN_GAP_MS ?? 0),
    rateLimitGapMs: deps.provider ? 0 : Number(process.env.CREW_RATE_LIMIT_GAP_MS ?? 8000),
    ...liveIo(io, liveFlags),
    ...clock(),
  });

  try {
    if (cmd === "bot" && sub === "create") {
      const { flags, positional } = parseFlags(rest);
      const id = positional[0];
      if (!id) throw new Error("usage: crew bot create <id> [--name TEXT] [--model ID] [--soul FILE]");
      workspace.addBot({
        id,
        name: flags.name || id,
        model: flags.model || undefined,
        soul: readOptionalFile(flags.soul),
        icon: flags.icon || undefined,
      });
      io.writeOut(
        `bot created: ${id}${flags.model ? ` model=${flags.model}` : ""}\n`,
      );
      return 0;
    }

    if (cmd === "bot" && sub === "update") {
      const { flags, positional } = parseFlags(rest);
      const id = positional[0];
      if (!id) throw new Error("usage: crew bot update <id> [--name TEXT] [--soul FILE]");
      const patch: {
        name?: string;
        model?: string;
        fallbackModel?: string;
        soul?: string;
        standingOrders?: string;
        icon?: string;
      } = {};
      if (flags.name) patch.name = flags.name;
      if (flags.model) patch.model = flags.model;
      if (flags.fallback) patch.fallbackModel = flags.fallback;
      if (flags.soul) patch.soul = readOptionalFile(flags.soul);
      if (flags.orders) patch.standingOrders = readOptionalFile(flags.orders);
      if (flags.icon) patch.icon = flags.icon;
      workspace.updateBot(id, patch);
      io.writeOut(`bot updated: ${id}\n`);
      return 0;
    }

    if (cmd === "bot" && sub === "show") {
      const id = rest[0];
      if (!id) throw new Error("usage: crew bot show <id>");
      const bot = workspace.getBot(id);
      if (!bot) throw new Error(`unknown bot: ${id}`);
      io.writeOut(`id: ${bot.id}\n`);
      io.writeOut(`name: ${bot.name}\n`);
      io.writeOut(`model: ${bot.model ?? "-"}\n`);
      io.writeOut(`fallback: ${bot.fallbackModel ?? "-"}\n`);
      io.writeOut(`skills: ${(bot.skills ?? []).map((s) => s.name).join(",") || "-"}\n`);
      return 0;
    }

    if (cmd === "bot" && sub === "list") {
      for (const bot of workspace.listBots()) {
        io.writeOut(`${bot.id}\t${bot.name}\n`);
      }
      return 0;
    }

    if (cmd === "skill" && sub === "list") {
      const only = rest[0];
      for (const bot of workspace.listBots()) {
        if (only && bot.id !== only) continue;
        for (const s of bot.skills ?? []) {
          io.writeOut(`${bot.id}/${s.name}\t${s.description}\n`);
        }
      }
      return 0;
    }

    if (cmd === "skill" && sub === "show") {
      const botId = rest[0];
      const name = rest[1];
      if (!botId || !name) throw new Error("usage: crew skill show <bot> <name>");
      const skill = workspace.getSkill(botId, name);
      if (!skill) throw new Error(`unknown skill: ${botId}/${name}`);
      io.writeOut(skill.markdown ?? `${skill.name}\n${skill.description}\n\n${skill.body}\n`);
      return 0;
    }

    if (cmd === "skill" && sub === "add") {
      const { flags, positional } = parseFlags(rest);
      const botId = positional[0];
      if (!botId || !flags.name || !flags.desc) {
        throw new Error("usage: crew skill add <bot> --name N --desc D [--body FILE]");
      }
      workspace.addSkill(botId, {
        name: flags.name,
        description: flags.desc,
        body: readOptionalFile(flags.body) ?? "",
      });
      io.writeOut(`skill added: ${botId}/${flags.name}\n`);
      return 0;
    }

    if (cmd === "skill" && sub === "rm") {
      const botId = rest[0];
      const name = rest[1];
      if (!botId || !name) throw new Error("usage: crew skill rm <bot> <name>");
      workspace.removeSkill(botId, name);
      io.writeOut(`skill removed: ${botId}/${name}\n`);
      return 0;
    }

    if (cmd === "skill" && sub === "copy") {
      const fromBot = rest[0];
      const name = rest[1];
      const toBot = rest[2];
      if (!fromBot || !name || !toBot) {
        throw new Error("usage: crew skill copy <fromBot> <name> <toBot>");
      }
      const skill = workspace.getSkill(fromBot, name);
      if (!skill) throw new Error(`unknown skill: ${fromBot}/${name}`);
      workspace.addSkill(toBot, skill);
      io.writeOut(`skill copied: ${fromBot}/${name} -> ${toBot}\n`);
      return 0;
    }

    if (cmd === "channel" && sub === "create") {
      const { flags, positional } = parseFlags(rest);
      const id = positional[0];
      if (!id || !flags.bots) {
        throw new Error("usage: crew channel create <id> --bots a,b [--lead id]");
      }
      const memberBotIds = flags.bots
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      workspace.addChannel({
        id,
        leadBotId: flags.lead || undefined,
        memberBotIds,
        permissionMode: "auto-accept",
      });
      io.writeOut(`channel created: ${id}\n`);
      return 0;
    }

    if (cmd === "channel" && sub === "list") {
      for (const ch of workspace.listChannels()) {
        io.writeOut(`${ch.id}\n`);
      }
      return 0;
    }

    if (cmd === "channel" && sub === "show") {
      const id = rest[0] ?? sub;
      const ch = workspace.getChannel(id);
      if (!ch) throw new Error(`unknown channel: ${id}`);
      io.writeOut(
        `${ch.id} lead=${ch.leadBotId ?? "-"} mode=${ch.permissionMode} bots=${ch.memberBotIds.join(",")}\n`,
      );
      return 0;
    }

    if (cmd === "config" && sub === "show") {
      io.writeOut(`model: ${cfg.model ?? "(default z-ai/glm-5.3-flash)"}\n`);
      io.writeOut(`fallback: ${cfg.fallbackModel ?? "-"}\n`);
      io.writeOut(`allowed: ${(cfg.allowedModels ?? []).join(",") || "-"}\n`);
      io.writeOut(`key:   ${maskKey(cfg.apiKey)}\n`);
      io.writeOut(`base:  ${cfg.baseUrl ?? "(default https://openrouter.ai/api/v1)"}\n`);
      io.writeOut(`user:  ${userConfigPath(home)}\n`);
      io.writeOut(`proj:  ${projectConfigPath(io.cwd)}\n`);
      return 0;
    }

    if (cmd === "config" && sub === "set") {
      const field = rest[0];
      const value = rest.slice(1).join(" ");
      if (!field || !value) {
        throw new Error(
          "usage: crew config set <model|fallback|key|base-url|allowed> <value> [--global]",
        );
      }
      const global = globalFlag || field === "key" || field === "api-key";
      const path = global ? userConfigPath(home) : projectConfigPath(io.cwd);
      const patch =
        field === "model"
          ? { model: value }
          : field === "fallback"
            ? { fallbackModel: value }
            : field === "allowed"
              ? { allowedModels: value.split(",").map((s) => s.trim()).filter(Boolean) }
              : field === "key" || field === "api-key"
                ? { apiKey: value }
                : field === "base-url"
                  ? { baseUrl: value }
                  : undefined;
      if (!patch) throw new Error("unknown config field (model|fallback|key|base-url|allowed)");
      writeConfigFile(path, patch);
      if (field === "key" || field === "api-key") {
        io.writeOut(`key saved to ${path} (${maskKey(value)})\n`);
      } else {
        io.writeOut(`${field} = ${value}\n`);
        io.writeOut(`saved ${path}\n`);
      }
      return 0;
    }

    if (cmd === "mode") {
      const channelId = sub;
      const mode = rest[0] as PermissionMode | undefined;
      if (!channelId || !mode || !MODES.has(mode)) {
        throw new Error(
          "usage: crew mode <channel|dmId> <supervised|auto-accept|auto|full-access>",
        );
      }
      if (mode === "auto" && !(cfg.reviewerModel ?? "").trim()) {
        io.writeErr("auto has no reviewer model; behaving as supervised\n");
      }
      setThreadMode(io.cwd, workspace, channelId, mode);
      io.writeOut(`mode: ${mode}\n`);
      return 0;
    }

    if (cmd === "say") {
      const channelId = sub;
      const text = rest.join(" ");
      if (!channelId || !text) throw new Error("usage: crew say <channel> <text>");
      const channel = workspace.getChannel(channelId);
      if (channel?.permissionMode === "auto" && !(cfg.reviewerModel ?? "").trim()) {
        io.writeErr("auto has no reviewer model; behaving as supervised\n");
      }
      const mode = (channel?.permissionMode as CrewPermissionMode) || "auto-accept";
      const mcp = await collectMcpSessions({
        servers: loadMcp(io.cwd).servers,
        cwd: io.cwd,
        connect: deps.mcpConnect,
      });
      try {
      const result = await dispatchChannelPost({
        ...dispatchBase(),
        tools: [...tools, ...mcp.tools],
        providerForBot: (botId) => bindHarness(io.cwd, workspace, botId, mode, deps),
        channelId,
        text,
      });
      io.writeOut(wokeLine(result.woken));
      printReplies(io, result.replies.filter((r) => !r.text && !r.error));
      for (const dm of result.dms) {
        io.writeOut(`dm: ${dm.threadId}\n`);
        if (dm.error) io.writeErr(`${dm.botId} ERROR: ${dm.error}\n`);
        else if (dm.text.trim()) io.writeOut(`${dm.botId}: ${dm.text}\n`);
      }
      return 0;
      } finally {
        await mcp.close();
      }
    }

    if (cmd === "dms") {
      const dms = store.listThreads().filter((t) => t.kind === "dm");
      if (!sub || sub === "list") {
        if (dms.length === 0) {
          io.writeOut("(no dms)\n");
          return 0;
        }
        for (const thread of dms) io.writeOut(`${thread.id}\n`);
        return 0;
      }
      if (sub === "show") {
        const a = rest[0];
        const b = rest[1];
        if (!a) throw new Error("usage: crew dms show <a> <b>");
        const id = b ? dmThreadId(party(a), party(b)) : a;
        printThread(io, store.read({ kind: "dm", id }), {
          thinking: showThinking,
          verbose,
        });
        return 0;
      }
      throw new Error("usage: crew dms | crew dms show <a> <b>");
    }

    if (cmd === "dm") {
      const a = sub;
      const b = rest[0];
      const text = rest.slice(1).join(" ");
      if (!a || !b || !text) throw new Error("usage: crew dm <from> <to> <text>");
      const mcp = await collectMcpSessions({
        servers: loadMcp(io.cwd).servers,
        cwd: io.cwd,
        connect: deps.mcpConnect,
      });
      try {
      const dmId = dmThreadId(party(a), party(b));
      const existed = store.read({ kind: "dm", id: dmId }).length > 0;
      const prefs = loadDmPrefs(io.cwd);
      const mode = existed
        ? dmModeOf(prefs, dmId, "auto-accept")
        : dmModeOf(
            saveDmPrefs(
              io.cwd,
              ensureDmMode(prefs, dmId, cfg.defaultPermissionMode ?? "auto-accept"),
            ),
            dmId,
            "auto-accept",
          );
      const result = await dispatchDm({
        ...dispatchBase(),
        tools: [...tools, ...mcp.tools],
        providerForBot: (botId) => bindHarness(io.cwd, workspace, botId, mode, deps),
        permissionModeFor: (thread) =>
          thread.kind === "dm" ? dmModeOf(loadDmPrefs(io.cwd), thread.id, "auto-accept") : undefined,
        from: party(a),
        to: party(b),
        text,
      });
      io.writeOut(`dm: ${result.threadId}\n`);
      io.writeOut(wokeLine(result.woken));
      printReplies(io, result.replies.filter((r) => !r.text && !r.error));
      return 0;
      } finally {
        await mcp.close();
      }
    }

    if (cmd === "open") {
      const channelId = sub;
      if (!channelId) throw new Error("usage: crew open <channel>");
      if (!workspace.getChannel(channelId)) {
        throw new Error(`unknown channel: ${channelId}`);
      }
      io.writeOut(
        `opened #${channelId}  (/thinking on|off | /verbose on|off | /mode ... | /stop | /quit)\n`,
      );
      const read = io.readLine ?? defaultReadLine;
      while (true) {
        const line = await read();
        if (line === null) break;
        const trimmed = line.trim();
        if (!trimmed || trimmed === "/quit") break;
        if (trimmed.startsWith("/dm ")) {
          const body = trimmed.slice(4).trim();
          const space = body.indexOf(" ");
          const botId = space === -1 ? body : body.slice(0, space);
          const text = space === -1 ? "" : body.slice(space + 1);
          if (!botId || !text) {
            io.writeErr("usage: /dm <bot> <text>\n");
            continue;
          }
          const dm = await dispatchDm({
            ...dispatchBase(),
            from: { kind: "human" },
            to: { kind: "bot", botId },
            text,
          });
          io.writeOut(`dm: ${dm.threadId}\n`);
          io.writeOut(wokeLine(dm.woken));
          printReplies(io, dm.replies.filter((r) => !r.text && !r.error));
          continue;
        }
        if (trimmed === "/thinking on") {
          liveFlags.thinking = true;
          io.writeOut("thinking: on\n");
          continue;
        }
        if (trimmed === "/thinking off") {
          liveFlags.thinking = false;
          io.writeOut("thinking: off\n");
          continue;
        }
        if (trimmed === "/verbose on") {
          liveFlags.verbose = true;
          io.writeOut("verbose: on\n");
          continue;
        }
        if (trimmed === "/verbose off") {
          liveFlags.verbose = false;
          io.writeOut("verbose: off\n");
          continue;
        }
        if (trimmed === "/stop") {
          if (!halt.stopped) io.writeOut("nothing running\n");
          halt.stopped = true;
          continue;
        }
        if (trimmed.startsWith("/mode ")) {
          const mode = trimmed.slice(6).trim() as PermissionMode;
          if (!MODES.has(mode)) {
            io.writeErr("unknown mode\n");
            continue;
          }
          if (mode === "auto" && !(cfg.reviewerModel ?? "").trim()) {
            io.writeErr("auto has no reviewer model; behaving as supervised\n");
          }
          setThreadMode(io.cwd, workspace, channelId, mode);
          io.writeOut(`mode: ${mode}\n`);
          continue;
        }
        halt.stopped = false;
        const result = await dispatchChannelPost({
          ...dispatchBase(),
          channelId,
          text: trimmed,
        });
        io.writeOut(wokeLine(result.woken));
        printReplies(io, result.replies.filter((r) => !r.text && !r.error));
      }
      return 0;
    }

    if (cmd === "log") {
      const channelId = sub;
      if (!channelId) throw new Error("usage: crew log <channel> [--thinking] [--verbose]");
      printThread(io, store.read({ kind: "channel", id: channelId }), {
        thinking: showThinking,
        verbose,
      });
      return 0;
    }

    if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
      io.writeOut(USAGE);
      return cmd ? 0 : 1;
    }
    io.writeErr("unknown command\n");
    io.writeOut(USAGE);
    return 1;
  } catch (err) {
    io.writeErr(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
