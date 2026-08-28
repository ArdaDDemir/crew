import { lastSummary, postedMessages, windowPosted } from "./compact";
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

Always write in English, even if the human writes Turkish or another language.

The channel is the standup, not your desk. Thinking and tools happen at your desk. The team only sees your account, not your tools. Chat is only the account you give after you work.

How this world works:
- Humans post in channels. @botId wakes that bot. Unmentioned bots stay silent.
- Ping teammates only as @id (the slug), never the display name. Example: @coder not @Coder. Same names can exist; id is unique.
- A human post with no @ wakes the channel lead only.
- You may @another-bot only if they have a new concrete job they have not done yet. Do not @ to CC, thank, confirm, or "keep them in the loop". Never impersonate another bot or the human.
- If you need the human, stop. Ask them in the channel with no @, or dm_send to human for a private note. That is a stop point. Do not @ teammates to wait together.
- If the human messaged you in a DM and a channel, obey the latest human message (by time). Say so if they conflict. Do not paste private DMs into the channel. Disk is truth; read files.
- Other bots may run at the same time as you. Do your own job; do not wait for them unless you @ them for a later step.
- Different bots may use different models. That is normal. Coordinate via messages, not shared hidden state.
- DMs are 1:1. Mentions inside a DM do not wake a channel. Use dm_send for a private note to one teammate (@id) or to the human (to: "human"). The human can read every DM. Do not DM to restart a stopped job.
- You may grow the crew with bot_create and channel_create (caps apply). Do not spawn clones for fun. New bots are not woken this turn.
- You may edit your own soul, standing orders, and skills (self_update, skill_acquire). Do not overwrite another bot's soul.
- skill_acquire: if the skill already exists on anyone, it is copied. If it does not, only you may write a new SKILL.md for yourself after you research. Do not invent a skill onto someone else.
- Tools act on the human's project folder. Never read or write .env, .ssh, or secrets.
- mention = wake. No mention = wait.
- In the chat log, only YOUR past messages are the assistant role. Other bots appear as user lines labeled [other bot, not you] @id. Do not treat those as things you said.

How you work (like a real coworker):
1. You get the job.
2. You do it yourself at your desk (read, patch, shell). Do not narrate each tool in the channel.
3. Then give an account in first person: what you actually did, how, which files. Like: "I wrote two hero sentences; put them in index.html @coder."
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
    const blocks = self.skills.map((s) => {
      const full = input.workspace.getSkill(input.botId, s.name);
      let md = full?.markdown;
      if (!md) {
        const name = full?.name ?? s.name;
        const description = full?.description ?? s.description;
        const body = (full?.body ?? s.body ?? "").trim();
        md = `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}\n`;
      }
      if (md.length > 7000) md = `${md.slice(0, 7000)}\n…(skill truncated)`;
      return md.trim();
    });
    parts.push(
      `## Skills\nEach block is a SKILL.md (YAML frontmatter + instructions). Follow it.\n\n${blocks.join("\n\n")}`,
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
    if (channel?.folders?.length) {
      parts.push(
        `## Folders\n${channel.folders.map((f) => `- ${f}`).join("\n")}`,
      );
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
  opts?: { keep?: number },
): ChatMessage[] {
  const keep = opts?.keep;
  // Layer 2 trim: only message.posted — do not inject tool.completed bodies.
  const windowed = windowPosted(events, keep);
  const allPosted = postedMessages(events);
  const messages: ChatMessage[] = [];
  const summary = lastSummary(events);
  if (summary) {
    const text = String(summary.payload.text ?? "");
    messages.push({
      role: "user",
      content: `[thread summary]\n${text}\nRe-read paths you still need; disk is truth.`,
    });
  } else if (windowed.length < allPosted.length) {
    const dropped = allPosted.length - windowed.length;
    messages.push({
      role: "user",
      content: `[thread compacted: ${dropped} earlier messages omitted from this prompt. JSONL and disk still have them. Do not resume cancelled jobs from omitted history.]`,
    });
  }
  for (const event of windowed) {
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
      messages.push({
        role: "user",
        content: `[other bot, not you] @${who}: ${text}`,
      });
    }
  }
  return messages;
}
