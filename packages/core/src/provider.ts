export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
};

export type ChatEvent =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "tool-call"; id: string; name: string; arguments: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface Provider {
  complete(req: ChatRequest): AsyncIterable<ChatEvent>;
}

export class ScriptedProvider implements Provider {
  constructor(private readonly scripts: ChatEvent[][]) {}

  async *complete(_req: ChatRequest): AsyncIterable<ChatEvent> {
    const next = this.scripts.shift();
    if (!next) {
      yield { type: "error", message: "ScriptedProvider: no script left" };
      yield { type: "done" };
      return;
    }
    for (const event of next) {
      yield event;
    }
    if (next.at(-1)?.type !== "done") {
      yield { type: "done" };
    }
  }
}
