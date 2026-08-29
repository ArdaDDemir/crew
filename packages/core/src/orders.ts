import type { CrewEvent, ThreadRef } from "./events";
import { humanIdOf, OWNER_HUMAN_ID, parseDmThreadId, threadKey } from "./events";
import type { EventStore } from "./store";
import type { Participant } from "./router";
import type { Workspace } from "./workspace";

export type HumanOrder = {
  thread: ThreadRef;
  ts: string;
  text: string;
};

function isHumanPost(event: CrewEvent): boolean {
  if (event.type !== "message.posted") return false;
  const author = event.payload.author as { kind?: string };
  return author?.kind === "human";
}

function wakingHumanId(humanId?: string): string {
  const id = String(humanId ?? "").trim();
  return id || OWNER_HUMAN_ID;
}

function postHumanId(event: CrewEvent): string {
  return humanIdOf(event.payload.author as { kind?: string; humanId?: string });
}

function dmHumanId(thread: ThreadRef): string | undefined {
  if (thread.kind !== "dm") return undefined;
  try {
    const parsed = parseDmThreadId(thread.id);
    if (!parsed.withHuman) return undefined;
    return parsed.left === "human" ? OWNER_HUMAN_ID : parsed.left;
  } catch {
    return undefined;
  }
}

function dmInvolvesBot(store: EventStore, thread: ThreadRef, botId: string): boolean {
  if (thread.kind !== "dm") return false;
  try {
    const parsed = parseDmThreadId(thread.id);
    if (parsed.right === botId) return true;
    if (!parsed.withHuman && parsed.left === botId) return true;
  } catch {
    /* fall through to opened participants */
  }
  const opened = store.read(thread).find((e) => e.type === "dm.opened");
  const raw = opened?.payload.participants;
  if (!Array.isArray(raw)) {
    return thread.id.split("__").includes(botId);
  }
  return (raw as Participant[]).some(
    (p) => p.kind === "bot" && p.botId === botId,
  );
}

export function collectHumanOrders(
  store: EventStore,
  workspace: Workspace,
  botId: string,
  humanId?: string,
): HumanOrder[] {
  const waking = wakingHumanId(humanId);
  const orders: HumanOrder[] = [];
  for (const thread of store.listThreads()) {
    if (thread.kind === "channel") {
      const channel = workspace.getChannel(thread.id);
      if (!channel?.memberBotIds.includes(botId)) continue;
    } else if (!dmInvolvesBot(store, thread, botId)) {
      continue;
    }
    for (const event of store.read(thread)) {
      if (!isHumanPost(event)) continue;
      if (postHumanId(event) !== waking) continue;
      orders.push({
        thread,
        ts: event.ts,
        text: String(event.payload.text ?? ""),
      });
    }
  }
  return orders.sort((a, b) => a.ts.localeCompare(b.ts));
}

export function lastOwnChannelAccount(
  store: EventStore,
  botId: string,
): { channelId: string; ts: string; text: string } | undefined {
  let best: { channelId: string; ts: string; text: string } | undefined;
  for (const thread of store.listThreads()) {
    if (thread.kind !== "channel") continue;
    for (const event of store.read(thread)) {
      if (event.type !== "message.posted") continue;
      const author = event.payload.author as { kind?: string; botId?: string };
      if (author?.kind !== "bot" || author.botId !== botId) continue;
      const row = {
        channelId: thread.id,
        ts: event.ts,
        text: String(event.payload.text ?? ""),
      };
      if (!best || row.ts >= best.ts) best = row;
    }
  }
  return best;
}

function gist(text: string, max = 180): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, Math.max(0, max - 3))}...`;
}

function lastHumanOn(
  store: EventStore,
  thread: ThreadRef,
): { ts: string; text: string } | undefined {
  let best: { ts: string; text: string } | undefined;
  for (const event of store.read(thread)) {
    if (!isHumanPost(event)) continue;
    const row = { ts: event.ts, text: String(event.payload.text ?? "") };
    if (!best || row.ts >= best.ts) best = row;
  }
  return best;
}

function label(thread: ThreadRef): string {
  return thread.kind === "channel" ? `channel #${thread.id}` : `dm ${thread.id}`;
}

export function buildCrossThreadNote(input: {
  store: EventStore;
  workspace: Workspace;
  botId: string;
  thread: ThreadRef;
  humanId?: string;
}): string | undefined {
  const waking = wakingHumanId(input.humanId);
  const orders = collectHumanOrders(input.store, input.workspace, input.botId, waking);
  const here = threadKey(input.thread);
  const elsewhere = orders.filter((o) => threadKey(o.thread) !== here);
  const latest = orders.at(-1);
  const lines: string[] = [
    "Cross-thread (engine). Always reply in English. Disk is truth — read files before claiming what is on them.",
  ];

  if (latest && threadKey(latest.thread) !== here) {
    lines.push(
      `Latest human message to you is in ${label(latest.thread)} at ${latest.ts}. If it conflicts with this thread, that latest human message wins. Say so in your account. Do not paste a private DM into a channel.`,
      `Latest human gist: ${gist(latest.text)}`,
    );
  } else if (elsewhere.length) {
    const lastOther = elsewhere.at(-1)!;
    lines.push(
      `You also have a human message in ${label(lastOther.thread)} at ${lastOther.ts} (older or same thread wins-by-time still applies). Do not paste private DMs into the channel.`,
      `Other human gist: ${gist(lastOther.text)}`,
    );
  }

  if (input.thread.kind === "channel") {
    const lastAccount = lastOwnChannelAccount(input.store, input.botId);
    const ownUnread: { ts: string; text: string }[] = [];
    let otherUnread = 0;
    for (const thread of input.store.listThreads()) {
      if (thread.kind !== "dm" || !dmInvolvesBot(input.store, thread, input.botId)) continue;
      const lastHuman = lastHumanOn(input.store, thread);
      if (!lastHuman) continue;
      if (lastAccount && lastHuman.ts <= lastAccount.ts) continue;
      const owner = dmHumanId(thread);
      if (owner === waking) ownUnread.push(lastHuman);
      else otherUnread += 1;
    }
    ownUnread.sort((a, b) => a.ts.localeCompare(b.ts));
    const unreadCount = ownUnread.length + otherUnread;
    if (unreadCount) {
      const unreadLabel = unreadCount === 1 ? "1 unread DM" : `${unreadCount} unread DMs`;
      if (ownUnread.length) {
        const newest = ownUnread.at(-1)!;
        lines.push(
          `${unreadLabel}. Newest gist: ${gist(newest.text, 120)}. Pointer only — do not dump them in the channel.`,
        );
      } else {
        lines.push(`${unreadLabel}. Pointer only — do not dump them in the channel.`);
      }
    }
  } else {
    const last = lastOwnChannelAccount(input.store, input.botId);
    if (last) {
      lines.push(
        `Your last channel account in #${last.channelId} at ${last.ts}: ${gist(last.text)}`,
        "That account may be stale. Re-read those files; disk is truth.",
      );
    }
  }

  if (lines.length === 1) return undefined;
  return lines.join("\n");
}
