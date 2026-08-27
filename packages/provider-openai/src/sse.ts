import type { ChatEvent } from "@crew/core";

type OpenAIToolCallDelta = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};

type OpenAIChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_content?: string | null;
      tool_calls?: OpenAIToolCallDelta[];
    };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
};

export function parseSseChunk(
  data: string,
  toolAcc: Map<number, { id: string; name: string; arguments: string }>,
): ChatEvent[] {
  if (data === "[DONE]") return [{ type: "done" }];
  let json: OpenAIChunk;
  try {
    json = JSON.parse(data) as OpenAIChunk;
  } catch {
    return [];
  }
  if (json.error?.message) {
    return [{ type: "error", message: json.error.message }, { type: "done" }];
  }
  const choice = json.choices?.[0];
  if (!choice) return [];
  const events: ChatEvent[] = [];
  const text = choice.delta?.content;
  if (text) events.push({ type: "text-delta", text });
  const thinking = choice.delta?.reasoning || choice.delta?.reasoning_content;
  if (thinking) events.push({ type: "reasoning-delta", text: thinking });
  for (const part of choice.delta?.tool_calls ?? []) {
    const index = part.index ?? 0;
    const current = toolAcc.get(index) ?? { id: "", name: "", arguments: "" };
    if (part.id) current.id = part.id;
    if (part.function?.name) current.name += part.function.name;
    if (part.function?.arguments) current.arguments += part.function.arguments;
    toolAcc.set(index, current);
  }
  if (choice.finish_reason === "tool_calls") {
    for (const call of toolAcc.values()) {
      events.push({
        type: "tool-call",
        id: call.id || "call",
        name: call.name,
        arguments: call.arguments,
      });
    }
    toolAcc.clear();
  }
  if (choice.finish_reason === "stop") {
    events.push({ type: "done" });
  }
  return events;
}

export function splitSse(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buffer;
  while (true) {
    const idx = rest.indexOf("\n\n");
    if (idx === -1) break;
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    const dataLines = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (dataLines.length) frames.push(dataLines.join("\n"));
  }
  return { frames, rest };
}
