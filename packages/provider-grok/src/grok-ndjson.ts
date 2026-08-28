import type { ChatEvent } from "@crew/core";

export function parseGrokLine(line: string): ChatEvent | null {
  const raw = line.trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const row = parsed as { type?: unknown; data?: unknown; message?: unknown; text?: unknown };
  const type = String(row.type ?? "");
  if (type === "text") {
    const text = String(row.data ?? row.text ?? "");
    return text ? { type: "text-delta", text } : null;
  }
  if (type === "thought") {
    const text = String(row.data ?? row.text ?? "");
    return text ? { type: "reasoning-delta", text } : null;
  }
  if (type === "error") {
    const message = String(row.message ?? row.data ?? "Grok error");
    return { type: "error", message };
  }
  return null;
}
