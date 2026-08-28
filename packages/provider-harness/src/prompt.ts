import type { ChatMessage } from "@crew/core";
import type { HarnessKind } from "./argv";

const NAMES: Record<HarnessKind, string> = {
  grok: "Grok",
  claude: "Claude",
  codex: "Codex",
  opencode: "OpenCode",
};

export function flattenHarnessPrompt(kind: HarnessKind, messages: ChatMessage[]): string {
  const name = NAMES[kind];
  const parts: string[] = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      parts.push(stripTools(msg.content).trim());
      continue;
    }
    if (msg.role === "tool") {
      parts.push(`tool ${msg.tool_call_id}: ${msg.content}`);
      continue;
    }
    parts.push(`${msg.role}: ${msg.content}`);
  }
  parts.push(
    `Do the desk work with your own ${name} tools (not Crew's tool list). Then write a first-person English account of what you actually did, files touched, and what is still missing. The Crew office posts only that account.`,
  );
  return parts.filter(Boolean).join("\n\n");
}

function stripTools(system: string): string {
  const cut = system.search(/\n# Tools\b/);
  return cut === -1 ? system : system.slice(0, cut).trimEnd();
}
