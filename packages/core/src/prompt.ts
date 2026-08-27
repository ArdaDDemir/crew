import type { CrewEvent, ThreadRef } from "./events";
import type { ChatMessage } from "./provider";
import type { Participant } from "./router";
import type { BotRecord, Workspace } from "./workspace";

export type PromptInput = {
  workspace: Workspace;
  botId: string;
  thread: ThreadRef;
  toolNames: string[];
  dmParticipants?: Participant[];
};

const WORLD = `You are a named teammate in Crew, a local multi-agent workspace (not Discord, not a chatbot toy).

The channel is the standup, not your desk. Thinking and tools happen at your desk. The team only sees your account, not your tools. Chat is only the account you give after you work.

How this world works:
- Humans post in channels. @botId wakes that bot. Unmentioned bots stay silent.
- A human post with no @ wakes the channel lead only.
- You may @another-bot only if they have a new concrete job they have not done yet. Do not @ to CC, thank, confirm, or "keep them in the loop". Never impersonate another bot or the human.
- If you need the human, stop. Ask them in the channel with no @. That is a stop point. Do not @ teammates to wait together.
- Other bots may run at the same time as you. Do your own job; do not wait for them unless you @ them for a later step.
- Different bots may use different models. That is normal. Coordinate via messages, not shared hidden state.
- DMs are 1:1. Mentions inside a DM do not wake a channel.
- Tools act on the human's project folder. Never read or write .env, .ssh, or secrets.
- mention = wake. No mention = wait.
- In the chat log, only YOUR past messages are the assistant role. Other bots appear as user lines labeled @id. Do not treat those as things you said.

How you work (like a real coworker):
1. You get the job.
2. You do it yourself at your desk (read, patch, shell). Do not narrate each tool in the channel.
3. Then give an account in first person: what you actually did, how, which files. Like: "bak hero'yu iki cümle yazdım, index.html'e sen koy @coder."
4. If something is missing, ask. Do not invent the spec.
5. If it didn't work, say so. Don't fake success. Do not say "done:" as a protocol.
6. One pass. No extra research theatre.

Files: apply_patch (empty old_text creates a file). Look around with read / list_dir. Shell is allowed for real commands (npm, tests). Don't use shell just to echo files into existence if apply_patch works.
- If a tool is denied, do not retry it. Say so in chat and stop.
- Do not @ a bot the human said should wait.
- If two of you might touch the same file, only the owner writes it (coder → code, designer → copy).`;

function botLine(bot: BotRecord, selfId: string, leadId?: string): string {
  const bits = [`- @${bot.id} (${bot.name})`];
  if (bot.id === selfId) bits.push("← YOU");
  if (leadId && bot.id === leadId) bits.push("[channel lead]");
  if (bot.soul) bits.push(`— ${bot.soul.split("\n")[0]!.slice(0, 120)}`);
  return bits.join(" ");
}

export function buildSystemPrompt(input: PromptInput): string {
  const self = input.workspace.getBot(input.botId);
  const parts: string[] = [WORLD];

  parts.push(
    `# You\nYou are ${self?.name ?? input.botId} (@${input.botId}).\nid: ${input.botId}\nname: ${self?.name ?? input.botId}\nmodel: ${self?.model ?? "(workspace default)"}`,
  );
  if (self?.soul?.trim()) parts.push(`## Soul\n${self.soul.trim()}`);
  if (self?.standingOrders?.trim()) {
    parts.push(`## Standing orders\n${self.standingOrders.trim()}`);
  }
  if (self?.skills?.length) {
    parts.push(
      `## Skills\n${self.skills.map((s) => `- ${s.name}: ${s.description}`).join("\n")}`,
    );
  }

  if (input.thread.kind === "channel") {
    const channel = input.workspace.getChannel(input.thread.id);
    const members = (channel?.memberBotIds ?? [])
      .map((id) => input.workspace.getBot(id))
      .filter((b): b is BotRecord => Boolean(b));
    parts.push(
      `# Channel #${input.thread.id}\nlead of this channel: @${channel?.leadBotId ?? "(none)"}\npermission mode: ${channel?.permissionMode ?? "auto-accept"}`,
    );
    parts.push(
      `## Members\n${members.map((b) => botLine(b, input.botId, channel?.leadBotId)).join("\n")}`,
    );
    if (channel?.rules?.trim()) parts.push(`## Channel rules\n${channel.rules.trim()}`);
    if (channel?.context?.trim()) {
      parts.push(`## Channel context\n${channel.context.trim()}`);
    }
    parts.push(
      "You were woken in this channel (mentioned, or you are the lead). Work at your desk. Then give an account. If someone else must act next, @them.",
    );
  } else {
    const labels = (input.dmParticipants ?? []).map((p) =>
      p.kind === "human" ? "human" : `@${p.botId}`,
    );
    parts.push(
      `# Private DM (${input.thread.id})\nparticipants: ${labels.join(", ") || "unknown"}\nMentions here do not wake a channel.`,
    );
  }

  if (input.toolNames.length) {
    parts.push(`# Tools\n${input.toolNames.map((n) => `- ${n}`).join("\n")}`);
  }

  return parts.join("\n\n");
}

export function buildHistory(
  events: CrewEvent[],
  selfId: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const event of events) {
    if (event.type !== "message.posted") continue;
    const text = String(event.payload.text ?? "");
    const author = event.payload.author as { kind?: string; botId?: string };
    if (author?.kind === "human") {
      messages.push({ role: "user", content: `human: ${text}` });
      continue;
    }
    const who = author?.botId ?? "bot";
    if (who === selfId) {
      messages.push({ role: "assistant", content: text });
    } else {
      messages.push({ role: "user", content: `@${who}: ${text}` });
    }
  }
  return messages;
}
