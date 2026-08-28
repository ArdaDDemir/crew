import type { ChatEvent } from "@crew/core";
import type { HarnessKind } from "./argv";

export function parseHarnessLine(kind: HarnessKind, line: string): ChatEvent | null {
  const raw = line.trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  if (kind === "grok") return grok(row);
  if (kind === "claude") return claude(row);
  if (kind === "codex") return codex(row);
  return opencode(row);
}

export function isClaudeSuccessResult(line: string): boolean {
  try {
    const row = JSON.parse(line) as { type?: unknown; subtype?: unknown; is_error?: unknown };
    return row.type === "result" && row.subtype === "success" && row.is_error !== true;
  } catch {
    return false;
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function grok(row: Record<string, unknown>): ChatEvent | null {
  const type = str(row.type);
  if (type === "text") {
    const text = str(row.data) || str(row.text);
    return text ? { type: "text-delta", text } : null;
  }
  if (type === "thought") {
    const text = str(row.data) || str(row.text);
    return text ? { type: "reasoning-delta", text } : null;
  }
  if (type === "error") return { type: "error", message: str(row.message) || str(row.data) || "Grok error" };
  return null;
}

function claude(row: Record<string, unknown>): ChatEvent | null {
  const type = str(row.type);
  if (type === "assistant") {
    const message = row.message as { content?: unknown } | undefined;
    const content = Array.isArray(message?.content) ? message.content : [];
    let thinking = "";
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as { type?: unknown; text?: unknown; thinking?: unknown };
      if (b.type === "text" && str(b.text)) return { type: "text-delta", text: str(b.text) };
      if ((b.type === "thinking" || b.type === "reasoning") && str(b.thinking)) thinking = str(b.thinking);
    }
    return thinking ? { type: "reasoning-delta", text: thinking } : null;
  }
  if (type === "content_block_delta") {
    const delta = row.delta as { type?: unknown; text?: unknown; thinking?: unknown } | undefined;
    if (delta?.type === "text_delta" && str(delta.text)) return { type: "text-delta", text: str(delta.text) };
    if (str(delta?.thinking)) return { type: "reasoning-delta", text: str(delta?.thinking) };
    return null;
  }
  if (type === "result") {
    const text = str(row.result) || str(row.message);
    if (row.is_error === true || str(row.subtype).startsWith("error")) {
      return { type: "error", message: text || "Claude error" };
    }
    return text ? { type: "text-delta", text } : null;
  }
  if (type === "error") {
    const err = row.error as { message?: unknown } | undefined;
    return { type: "error", message: str(err?.message) || str(row.message) || "Claude error" };
  }
  return null;
}

function nestItem(row: Record<string, unknown>): Record<string, unknown> | undefined {
  if (row.item && typeof row.item === "object" && !Array.isArray(row.item)) {
    return row.item as Record<string, unknown>;
  }
  const params = row.params as { item?: unknown; delta?: unknown } | undefined;
  if (params?.item && typeof params.item === "object") return params.item as Record<string, unknown>;
  return undefined;
}

function codex(row: Record<string, unknown>): ChatEvent | null {
  const type = str(row.type) || str(row.method);
  const item = nestItem(row);
  const itemType = str(item?.type) || str(item?.item_type);
  const delta =
    str(row.delta) ||
    str((row.params as { delta?: unknown } | undefined)?.delta) ||
    str(item?.delta) ||
    str(item?.text);
  if (/agentMessage\.delta|agent_message\/delta|item\/agentMessage\/delta/i.test(type) && delta) {
    return { type: "text-delta", text: delta };
  }
  if (/reasoning\.delta|item\/reasoning\/delta/i.test(type) && delta) {
    return { type: "reasoning-delta", text: delta };
  }
  if (item && /completed/i.test(type)) {
    const text = str(item.text) || str(item.content);
    if (/agentMessage|agent_message|message/i.test(itemType) && text) {
      return { type: "text-delta", text };
    }
    if (/reasoning|thought/i.test(itemType) && text) return { type: "reasoning-delta", text };
  }
  if (/error|failed/i.test(type)) {
    const err = (row.error as { message?: unknown } | undefined) ?? item;
    return { type: "error", message: str(err?.message) || str(row.message) || "Codex error" };
  }
  return null;
}

function opencode(row: Record<string, unknown>): ChatEvent | null {
  const type = str(row.type);
  const part = row.part && typeof row.part === "object" ? (row.part as Record<string, unknown>) : undefined;
  if (type === "text") {
    const text = str(part?.text) || str(row.text);
    return text ? { type: "text-delta", text } : null;
  }
  if (type === "error") {
    const err = row.error as { message?: unknown } | undefined;
    return { type: "error", message: str(err?.message) || str(row.message) || "OpenCode error" };
  }
  return null;
}
