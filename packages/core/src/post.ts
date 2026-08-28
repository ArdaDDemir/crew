import { dmThreadId, parseDmThreadId, type CrewEvent, type ThreadRef } from "./events";
import type { EventStore } from "./store";
import type { Workspace } from "./workspace";
import { routeDmWake, routeWakes, type Participant, type Post } from "./router";

export type Clock = {
  nextId: () => string;
  now: () => string;
};

export type PostToChannelInput = Clock & {
  store: EventStore;
  workspace: Workspace;
  channelId: string;
  post: Post;
};

export type PostToDmInput = Clock & {
  store: EventStore;
  from: Participant;
  to: Participant;
  text: string;
  threadId?: string;
};

function event(
  clock: Clock,
  thread: ThreadRef,
  type: string,
  payload: Record<string, unknown>,
  parent: string | null = null,
): CrewEvent {
  return {
    v: 1,
    id: clock.nextId(),
    ts: clock.now(),
    thread,
    type,
    parent,
    payload,
  };
}

export async function postToChannel(input: PostToChannelInput) {
  const channel = input.workspace.getChannel(input.channelId);
  if (!channel) {
    throw new Error(`unknown channel: ${input.channelId}`);
  }

  const thread: ThreadRef = { kind: "channel", id: channel.id };
  const decision = routeWakes(channel, input.post);
  const posted = event(input, thread, "message.posted", {
    author: input.post.author,
    text: input.post.text,
    mentions: decision.mentions,
  });
  input.store.append(posted);

  const leadFallback =
    decision.woken.length === 1 &&
    channel.leadBotId === decision.woken[0] &&
    !decision.mentions.includes(decision.woken[0]) &&
    !decision.mentions.includes("everyone");

  for (const botId of decision.woken) {
    input.store.append(
      event(input, thread, "bot.woken", {
        botId,
        reason: leadFallback ? "lead" : "mention",
      }),
    );
  }

  return { woken: decision.woken, eventIds: [posted.id] };
}

export async function postToDm(input: PostToDmInput) {
  const pair = dmThreadId(input.from, input.to);
  const threadId = input.threadId ?? pair;
  if (parseDmThreadId(threadId).pair !== pair) {
    throw new Error(`thread ${threadId} is not ${pair}`);
  }
  const thread: ThreadRef = { kind: "dm", id: threadId };
  const existing = input.store.read(thread);
  if (existing.length === 0) {
    input.store.append(event(input, thread, "dm.opened", {
      participants: [input.from, input.to],
    }));
  }

  const dm = {
    id: threadId,
    participants: [input.from, input.to],
  };
  const post: Post =
    input.from.kind === "human"
      ? { author: { kind: "human" }, text: input.text }
      : { author: { kind: "bot", botId: input.from.botId }, text: input.text };

  const decision = routeDmWake(dm, post);
  input.store.append(
    event(input, thread, "message.posted", {
      author: post.author,
      text: input.text,
      mentions: decision.mentions,
    }),
  );
  for (const botId of decision.woken) {
    input.store.append(
      event(input, thread, "bot.woken", { botId, reason: "dm" }),
    );
  }

  return { threadId, woken: decision.woken };
}
