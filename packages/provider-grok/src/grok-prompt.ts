import type { ChatMessage } from "@crew/core";

const ACCOUNT =
  "Do the desk work with your own Grok tools (not Crew's tool list). Then write a first-person English account of what you actually did, files touched, and what is still missing. The Crew office posts only that account.";

export function flattenGrokPrompt(messages: ChatMessage[]): string {
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
  parts.push(ACCOUNT);
  return parts.filter(Boolean).join("\n\n");
}

function stripTools(system: string): string {
  const cut = system.search(/\n# Tools\b/);
  return cut === -1 ? system : system.slice(0, cut).trimEnd();
}

export function buildGrokArgv(input: {
  binary: string;
  cwd: string;
  promptFile: string;
  model?: string;
}): string[] {
  const argv = [
    input.binary,
    "--prompt-file",
    input.promptFile,
    "--cwd",
    input.cwd,
    "--output-format",
    "streaming-json",
    "--always-approve",
    "--verbatim",
    "--no-alt-screen",
    "--no-auto-update",
    "--max-turns",
    "8",
    "--deny",
    "Read(**/.env)",
    "--deny",
    "Read(**/.ssh/**)",
    "--deny",
    "Edit(**/.env)",
    "--deny",
    "Write(**/.env)",
    "--deny",
    "Edit(**/.ssh/**)",
    "--deny",
    "Write(**/.ssh/**)",
  ];
  const model = input.model?.trim();
  if (model) argv.push("-m", model);
  return argv;
}
