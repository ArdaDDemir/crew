import { resolve } from "node:path";
import type { Clock } from "./post";
import type { CrewEvent, ThreadRef } from "./events";
import type { EventStore } from "./store";
import type { Workspace } from "./workspace";
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
import { buildHistory, buildSystemPrompt } from "./prompt";
import type { Participant } from "./router";

export type Tool = ToolSpec & {
  execute: (
    args: Record<string, unknown>,
    ctx: { workspaceRoot: string },
  ) => Promise<string>;
};

export type AskFn = (input: {
  tool: string;
  args: Record<string, unknown>;
}) => Promise<"allow" | "deny" | "always">;

export type RunBotTurnInput = Clock & {
  store: EventStore;
  workspace: Workspace;
  provider: Provider;
  tools: Tool[];
  thread: ThreadRef;
  botId: string;
  model: string;
  workspaceRoot: string;
  ask: AskFn;
  hasReviewer: boolean;
  maxRounds?: number;
  onEvent?: (event: ChatEvent) => void;
  onStatus?: (message: string) => void;
};

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
  "Desk work for this pass is done. Give an account in first person: what you actually did, files touched, what's missing, what failed. Do not narrate tools. No more tool calls unless a patch is still required to finish this pass.";

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
  const model = bot.model ?? input.model;

  append(input, input.thread, "bot.turn.started", { botId: input.botId, model });
  input.onStatus?.(`${input.botId} → ${model}`);

  const modeRaw =
    input.thread.kind === "channel"
      ? input.workspace.getChannel(input.thread.id)?.permissionMode
      : "auto-accept";
  const { mode } = effectiveMode(modeRaw ?? "auto-accept", input.hasReviewer);

  const toolsByName = new Map(input.tools.map((t) => [t.name, t]));
  const toolSpecs: ToolSpec[] = input.tools.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        workspace: input.workspace,
        botId: input.botId,
        thread: input.thread,
        toolNames: input.tools.map((t) => t.name),
        dmParticipants: dmParticipants(input.store, input.thread),
      }),
    },
    ...buildHistory(input.store.read(input.thread), input.botId),
  ];

  const toolNames: string[] = [];
  let finalText = "";
  let error: string | undefined;
  const maxRounds = input.maxRounds ?? 4;
  let denials = 0;
  let accountNudged = false;

  for (let round = 0; round < maxRounds; round += 1) {
    let collected: { text: string; toolCalls: ToolCall[]; error?: string };
    const reasoning: string[] = [];
    try {
      collected = await collect(
        input.provider.complete({
          model,
          messages,
          tools: denials >= 2 ? undefined : toolSpecs,
        }),
        (event) => {
          if (event.type === "reasoning-delta") reasoning.push(event.text);
          input.onEvent?.(event);
        },
      );
      if (
        collected.error &&
        /inference processing failed/i.test(collected.error)
      ) {
        collected = await collect(
          input.provider.complete({
            model,
            messages,
            tools: toolSpecs,
          }),
          input.onEvent,
        );
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
      if (!tool) {
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
          const answer = await input.ask({ tool: call.name, args });
          allowed = answer === "allow" || answer === "always";
          append(input, input.thread, "permission.asked", {
            botId: input.botId,
            name: call.name,
            args,
          });
          append(input, input.thread, "permission.resolved", {
            decision: allowed ? "allow" : "deny",
          });
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
