import { parseMentions } from "./mentions";

export type Channel = {
  id: string;
  leadBotId?: string;
  memberBotIds: string[];
};

export type Participant =
  | { kind: "human" }
  | { kind: "bot"; botId: string };

export type Post =
  | { author: { kind: "human" }; text: string }
  | { author: { kind: "bot"; botId: string }; text: string };

export type DmThread = {
  id: string;
  participants: Participant[];
};

export type WakeDecision = {
  mentions: string[];
  woken: string[];
};

export function routeWakes(channel: Channel, post: Post): WakeDecision {
  const mentions = parseMentions(post.text);
  const members = new Set(channel.memberBotIds);
  const authorId = post.author.kind === "bot" ? post.author.botId : undefined;

  let woken: string[];
  if (mentions.includes("everyone")) {
    woken = channel.memberBotIds.filter((id) => id !== authorId);
  } else {
    woken = mentions.filter((id) => id !== "everyone" && members.has(id));
  }

  woken = woken.filter((id) => id !== authorId);

  if (
    woken.length === 0 &&
    post.author.kind === "human" &&
    channel.leadBotId &&
    members.has(channel.leadBotId)
  ) {
    woken = [channel.leadBotId];
  }

  return { mentions, woken };
}

export function routeDmWake(thread: DmThread, post: Post): WakeDecision {
  const authorId = post.author.kind === "bot" ? post.author.botId : undefined;
  const woken = thread.participants
    .filter((p): p is { kind: "bot"; botId: string } => p.kind === "bot")
    .map((p) => p.botId)
    .filter((id) => id !== authorId);
  return { mentions: [], woken };
}
