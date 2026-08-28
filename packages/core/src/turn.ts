import { resolve } from "node:path";
import type { Clock } from "./post";
import type { CrewEvent, ThreadRef } from "./events";
import type { EventStore } from "./store";
import type { PermissionMode, Workspace } from "./workspace";
import {
  decidePermission,
  effectiveMode,
  type ToolKind,
} from "./permissions";
import type {
  ChatEvent,
  ChatMessage,
  Provider,
  ToolCall,
  ToolSpec,
} from "./provider";
import { maybeCompact } from "./compact";
import { buildHistory, buildSystemPrompt } from "./prompt";
import { buildCrossThreadNote } from "./orders";
import type { Participant } from "./router";
import { ORG_TOOL_NAMES, orgNeedsAsk, orgToolSpecs, runOrgTool } from "./org";

export type Tool = ToolSpec & {
  execute: (
    args: Record<string, unknown>,
    ctx: { workspaceRoot: string },
  ) => Promise<string>;
};

export type AskFn = (input: {
  tool: string;
  args: Record<string, unknown>;
  botId?: string;
}) => Promise<"allow" | "deny" | "always">;

export type ReviewFn = (input: {
  tool: string;
  args: Record<string, unknown>;
  botId: string;
}) => Promise<"allow" | "deny" | "ask">;

export type RunBotTurnInput = Clock & {
  store: EventStore;
  workspace: Workspace;
  provider: Provider;
  tools: Tool[];
  thread: ThreadRef;
  botId: string;
  model: string;
  bindModel?: string;
  fallbackModel?: string;
  workspaceRoot: string;
  ask: AskFn;
  hasReviewer: boolean;
  review?: ReviewFn;
  maxRounds?: number;
  onEvent?: (event: ChatEvent) => void;
  onStatus?: (message: string) => void;
  sendDm?: (toBotId: string, text: string) => Promise<string>;
  shouldStop?: () => boolean;
  permissionMode?: PermissionMode;
};

async function settleAsk(
  input: RunBotTurnInput,
  mode: PermissionMode,
  call: { name: string; args: Record<string, unknown> },
): Promise<boolean> {
  if (mode === "auto" && input.review) {
    const judged = await input.review({
      tool: call.name,
      args: call.args,
      botId: input.botId,
    });
    if (judged === "allow" || judged === "deny") {
      append(input, input.thread, "permission.asked", {
        botId: input.botId,
        name: call.name,
        args: call.args,
        reviewer: true,
      });
      append(input, input.thread, "permission.resolved", {
        decision: judged,
        reviewer: true,
      });
      return judged === "allow";
    }
  }
  const answer = await input.ask({ tool: call.name, args: call.args, botId: input.botId });
  const allowed = answer === "allow" || answer === "always";
  append(input, input.thread, "permission.asked", {
    botId: input.botId,
    name: call.name,
    args: call.args,
  });
  append(input, input.thread, "permission.resolved", {
    decision: allowed ? "allow" : "deny",
  });
  return allowed;
}

function append(
  input: Clock & { store: EventStore },
  thread: ThreadRef,
  type: string,
  payload: Record<string, unknown>,
): CrewEvent {
  const event: CrewEvent = {
    v: 1,
    id: input.nextId(),
    ts: input.now(),
    thread,
    type,
    parent: null,
    payload,
  };
  input.store.append(event);
  return event;
}

function dmParticipants(store: EventStore, thread: ThreadRef): Participant[] | undefined {
  if (thread.kind !== "dm") return undefined;
  const opened = store.read(thread).find((e) => e.type === "dm.opened");
  const raw = opened?.payload.participants;
  if (!Array.isArray(raw)) return undefined;
  return raw as Participant[];
}

function asKind(name: string): ToolKind {
  if (name === "apply_patch" || name === "read" || name === "shell" || name === "list_dir") {
    return name;
  }
  return "shell";
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === "object") return value as Record<string, unknown>;
  } catch {
    return { _raw: raw };
  }
  return { _raw: raw };
}

const ACCOUNT_NUDGE =
  "Desk work for this pass is done. Give an account in English, first person: what you actually did, files touched, what's missing, what failed. Do not narrate tools. No more tool calls unless a patch is still required to finish this pass.";

async function collect(
  stream: AsyncIterable<ChatEvent>,
  onEvent?: (event: ChatEvent) => void,
): Promise<{
  text: string;
  toolCalls: ToolCall[];
  error?: string;
}> {
  let text = "";
  const toolCalls: ToolCall[] = [];
  for await (const event of stream) {
    if (event.type === "text-delta") {
      text += event.text;
      continue;
    }
    if (event.type === "done") continue;
    onEvent?.(event);
    if (event.type === "tool-call") {
      toolCalls.push({
        id: event.id,
        name: event.name,
        arguments: event.arguments,
      });
    }
    if (event.type === "error") return { text, toolCalls, error: event.message };
  }
  return { text, toolCalls };
}

export async function runBotTurn(input: RunBotTurnInput): Promise<{
  text: string;
  toolNames: string[];
  error?: string;
}> {
  const bot = input.workspace.getBot(input.botId);
  if (!bot) throw new Error(`unknown bot: ${input.botId}`);
  let model = input.bindModel || bot.model || input.model;
  const fallback = bot.fallbackModel || input.fallbackModel;

  append(input, input.thread, "bot.turn.started", { botId: input.botId, model });
  input.onStatus?.(`${input.botId} → ${model}`);

  const modeRaw =
    input.permissionMode ??
    (input.thread.kind === "channel"
      ? input.workspace.getChannel(input.thread.id)?.permissionMode
      : "auto-accept");
  const { mode } = effectiveMode(modeRaw ?? "auto-accept", input.hasReviewer);

  const tools: Tool[] = [...input.tools];
  if (input.thread.kind === "channel") {
    for (const spec of orgToolSpecs) {
      tools.push({
        ...spec,
        async execute() {
          return "use org";
        },
      });
    }
  }
  if (input.sendDm && input.thread.kind === "channel") {
    tools.push({
      name: "dm_send",
      description:
        "Private 1:1 note. `to` is a channel member bot id, or `human` to message the operator. The human can read every DM. Not a channel mention.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: 'bot id, or "human"',
          },
          text: { type: "string" },
        },
        required: ["to", "text"],
      },
      async execute() {
        return "use sendDm";
      },
    });
  }
  const toolsByName = new Map(tools.map((t) => [t.name, t]));
  const toolSpecs: ToolSpec[] = tools.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));

  maybeCompact(input.store, input.thread, input);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        workspace: input.workspace,
        botId: input.botId,
        thread: input.thread,
        toolNames: tools.map((t) => t.name),
        dmParticipants: dmParticipants(input.store, input.thread),
      }),
    },
    ...buildHistory(input.store.read(input.thread), input.botId),
  ];
  const cross = buildCrossThreadNote({
    store: input.store,
    workspace: input.workspace,
    botId: input.botId,
    thread: input.thread,
  });
  if (cross) messages.push({ role: "user", content: cross });

  const toolNames: string[] = [];
  let finalText = "";
  let error: string | undefined;
  const maxRounds = input.maxRounds ?? 4;
  let denials = 0;
  let accountNudged = false;

  for (let round = 0; round < maxRounds; round += 1) {
    if (input.shouldStop?.()) {
      error = "stopped";
      append(input, input.thread, "error", { message: "stopped", botId: input.botId });
      break;
    }
    let collected: { text: string; toolCalls: ToolCall[]; error?: string };
    const reasoning: string[] = [];
    const onDelta = (event: ChatEvent) => {
      if (event.type === "reasoning-delta") reasoning.push(event.text);
      input.onEvent?.(event);
    };
    const runModel = async (id: string) => {
      let next = await collect(
        input.provider.complete({
          model: id,
          messages,
          tools: denials >= 2 ? undefined : toolSpecs,
        }),
        onDelta,
      );
      if (next.error && /inference processing failed/i.test(next.error)) {
        next = await collect(
          input.provider.complete({
            model: id,
            messages,
            tools: undefined,
          }),
          onDelta,
        );
      }
      return next;
    };
    try {
      collected = await runModel(model);
      if (collected.error && fallback && fallback !== model) {
        input.onStatus?.(`${input.botId} → fallback ${fallback}`);
        model = fallback;
        collected = await runModel(model);
      }
    } catch (err) {
      collected = {
        text: "",
        toolCalls: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
    if (collected.error) {
      error = collected.error;
      append(input, input.thread, "error", { message: collected.error, botId: input.botId });
      break;
    }
    if (reasoning.length) {
      append(input, input.thread, "assistant.reasoning", {
        botId: input.botId,
        text: reasoning.join(""),
      });
    }
    if (collected.text) {
      append(input, input.thread, "assistant.delta", {
        botId: input.botId,
        text: collected.text,
      });
    }
    if (collected.toolCalls.length === 0) {
      if (collected.text) {
        input.onEvent?.({ type: "text-delta", text: collected.text });
      }
      finalText = collected.text;
      break;
    }

    messages.push({
      role: "assistant",
      content: collected.text,
      tool_calls: collected.toolCalls,
    });

    for (const call of collected.toolCalls) {
      toolNames.push(call.name);
      const args = parseArgs(call.arguments);
      append(input, input.thread, "tool.requested", {
        botId: input.botId,
        callId: call.id,
        name: call.name,
        args,
      });

      const tool = toolsByName.get(call.name);
      let output: string;
      if (call.name === "dm_send") {
        if (!input.sendDm) {
          output = "dm_send is not available in this thread";
        } else {
          try {
            output = await input.sendDm(
              String(args.to ?? ""),
              String(args.text ?? ""),
            );
          } catch (err) {
            output = `tool error (dm_send): ${err instanceof Error ? err.message : String(err)}`;
          }
        }
      } else if (ORG_TOOL_NAMES.has(call.name)) {
        let allowed = !orgNeedsAsk(mode, call.name);
        if (!allowed) {
          allowed = await settleAsk(input, mode, { name: call.name, args });
        }
        if (!allowed) {
          denials += 1;
          output = `permission denied for ${call.name}. Do not retry this turn.`;
        } else {
          try {
            output = runOrgTool(call.name, args, {
              workspace: input.workspace,
              botId: input.botId,
              channelId: input.thread.kind === "channel" ? input.thread.id : undefined,
            });
          } catch (err) {
            output = `tool error (${call.name}): ${err instanceof Error ? err.message : String(err)}`;
          }
        }
      } else if (!tool) {
        output = `unknown tool: ${call.name}`;
      } else {
        const rel = typeof args.path === "string" ? args.path : undefined;
        const absPath = rel ? resolve(input.workspaceRoot, rel) : undefined;
        const verdict = decidePermission({
          mode,
          tool: asKind(call.name),
          absPath,
          workspaceRoot: input.workspaceRoot,
        });
        let allowed = verdict === "allow";
        if (verdict === "ask") {
          allowed = await settleAsk(input, mode, { name: call.name, args });
        }
        if (verdict === "deny") {
          allowed = false;
        }
        if (!allowed) {
          denials += 1;
          output = `permission denied for ${call.name}. Do not retry this tool. Use read, list_dir, or apply_patch. Then post your final short channel message now.`;
        } else {
          try {
            output = await tool.execute(args, { workspaceRoot: input.workspaceRoot });
          } catch (err) {
            output = `tool error (${call.name}): ${err instanceof Error ? err.message : String(err)}`;
          }
        }
      }

      append(input, input.thread, "tool.completed", {
        botId: input.botId,
        callId: call.id,
        name: call.name,
        output: output.slice(0, 8000),
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: output,
      });
    }
    if (denials >= 2) {
      messages.push({
        role: "user",
        content:
          "Tools keep getting denied. Stop calling tools. Reply with a short final channel message only.",
      });
    } else if (!accountNudged) {
      messages.push({ role: "user", content: ACCOUNT_NUDGE });
      accountNudged = true;
    }
  }

  append(input, input.thread, "bot.turn.completed", {
    botId: input.botId,
    text: finalText,
    error: error ?? null,
  });
  input.onEvent?.({ type: "done" });
  return { text: finalText, toolNames, error };
}
