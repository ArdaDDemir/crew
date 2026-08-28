import { postToChannel, postToDm, type Clock } from "./post";
import type { EventStore } from "./store";
import type { Workspace } from "./workspace";
import type { Provider } from "./provider";
import { runBotTurn, type AskFn, type ReviewFn, type Tool } from "./turn";
import type { ChatEvent } from "./provider";
import type { Participant } from "./router";
import type { PermissionMode } from "./workspace";
import { parseMentions } from "./mentions";

export type BotProviderBind = {
  provider?: Provider;
  model?: string;
  fallbackModel?: string;
};

export type DispatchBase = Clock & {
  store: EventStore;
  workspace: Workspace;
  provider: Provider;
  providerForBot?: (botId: string) => BotProviderBind | undefined;
  tools: Tool[];
  model: string;
  fallbackModel?: string;
  workspaceRoot: string;
  ask: AskFn;
  hasReviewer: boolean;
  review?: ReviewFn;
  sleep?: (ms: number) => Promise<void>;
  turnGapMs?: number;
  rateLimitGapMs?: number;
  onStatus?: (message: string) => void;
  onWoken?: (woken: string[]) => void;
  onEvent?: (botId: string, event: ChatEvent) => void;
  shouldStop?: () => boolean;
  permissionModeFor?: (thread: { kind: "channel" | "dm"; id: string }) => PermissionMode | undefined;
};

function bindTurn(input: DispatchBase, botId: string) {
  const bind = input.providerForBot?.(botId);
  if (!bind) {
    return {
      provider: input.provider,
      bindModel: undefined,
      fallbackModel: input.fallbackModel,
    };
  }
  return {
    provider: bind.provider ?? input.provider,
    bindModel: bind.model,
    fallbackModel: bind.fallbackModel,
  };
}

function isRateLimit(error?: string): boolean {
  if (!error) return false;
  return /\b429\b/.test(error) || /rate-limit/i.test(error);
}

export async function dispatchChannelPost(
  input: DispatchBase & { channelId: string; text: string },
): Promise<{
  woken: string[];
  replies: { botId: string; text: string; error?: string }[];
  dms: { threadId: string; botId: string; text: string; error?: string }[];
  held?: { waiting: string[]; text: string };
}> {
  const posted = await postToChannel({
    store: input.store,
    workspace: input.workspace,
    nextId: input.nextId,
    now: input.now,
    channelId: input.channelId,
    post: { author: { kind: "human" }, text: input.text },
  });

  input.onWoken?.(posted.woken);
  const replies: { botId: string; text: string; error?: string }[] = [];
  const pendingDms: { threadId: string; botId: string }[] = [];
  const queue = [...posted.woken];
  const spoken = new Set<string>();
  const channel = input.workspace.getChannel(input.channelId);
  const mentioned = parseMentions(input.text);
  const humanPicked =
    mentioned.includes("everyone") ||
    Boolean(
      channel &&
        mentioned.some((id) => channel.memberBotIds.includes(id)),
    );
  let allowHandoff = !humanPicked;
  const sleep = input.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const rateGap = input.rateLimitGapMs ?? 0;
  let safety = 0;
  let previousWaveHadRateLimit = false;
  while (queue.length > 0 && safety < 8) {
    if (input.shouldStop?.()) break;
    safety += 1;
    const wave: string[] = [];
    for (const botId of queue.splice(0, queue.length)) {
      if (spoken.has(botId) || wave.includes(botId)) continue;
      spoken.add(botId);
      wave.push(botId);
    }
    if (wave.length === 0) break;
    if (previousWaveHadRateLimit && rateGap > 0) {
      await sleep(rateGap);
    }
    previousWaveHadRateLimit = false;
    const waveResults = await Promise.all(
      wave.map(async (botId) => {
        const turn = await runBotTurn({
          ...input,
          ...bindTurn(input, botId),
          thread: { kind: "channel", id: input.channelId },
          permissionMode: input.permissionModeFor?.({ kind: "channel", id: input.channelId }),
          botId,
          onStatus: input.onStatus,
          onEvent: input.onEvent
            ? (event) => input.onEvent!(botId, event)
            : undefined,
          sendDm: async (toId, text) => {
            if (!text.trim()) return "text is required";
            const toHuman = toId === "human" || toId === "you";
            if (toHuman) {
              const dm = await postToDm({
                store: input.store,
                nextId: input.nextId,
                now: input.now,
                from: { kind: "bot", botId },
                to: { kind: "human" },
                text,
              });
              return `dm sent to human (${dm.threadId})`;
            }
            const ch = input.workspace.getChannel(input.channelId);
            if (!ch?.memberBotIds.includes(toId)) {
              return `unknown or non-member bot: ${toId}`;
            }
            if (toId === botId) return "cannot DM yourself";
            const dm = await postToDm({
              store: input.store,
              nextId: input.nextId,
              now: input.now,
              from: { kind: "bot", botId },
              to: { kind: "bot", botId: toId },
              text,
            });
            for (const wokenId of dm.woken) {
              pendingDms.push({ threadId: dm.threadId, botId: wokenId });
            }
            return `dm sent to @${toId} (${dm.threadId})`;
          },
        });
        return { botId, turn };
      }),
    );
    for (const { botId, turn } of waveResults) {
      replies.push({ botId, text: turn.text, error: turn.error });
      if (isRateLimit(turn.error)) previousWaveHadRateLimit = true;
      if (turn.error || !turn.text.trim()) continue;
      const fan = await postToChannel({
        store: input.store,
        workspace: input.workspace,
        nextId: input.nextId,
        now: input.now,
        channelId: input.channelId,
        post: { author: { kind: "bot", botId }, text: turn.text },
      });
      if (allowHandoff) {
        queue.push(...fan.woken.filter((id) => !spoken.has(id)));
      }
    }
    allowHandoff = false;
  }

  const waiting: string[] = [];
  const seenWait = new Set<string>();
  const members = channel?.memberBotIds ?? [];
  for (const reply of replies) {
    if (!reply.text.trim()) continue;
    for (const id of parseMentions(reply.text)) {
      const ids = id === "everyone" ? members : [id];
      for (const mid of ids) {
        if (!members.includes(mid) || spoken.has(mid) || seenWait.has(mid)) continue;
        seenWait.add(mid);
        waiting.push(mid);
      }
    }
  }
  let held: { waiting: string[]; text: string } | undefined;
  if (waiting.length) {
    const names = waiting.map((id) => `@${id}`).join(", ");
    const text =
      waiting.length === 1
        ? `${names} was mentioned and will wait for your next message.`
        : `${names} were mentioned and will wait for your next message.`;
    held = { waiting, text };
    input.store.append({
      v: 1,
      id: input.nextId(),
      ts: input.now(),
      thread: { kind: "channel", id: input.channelId },
      type: "handoff.held",
      parent: null,
      payload: { waiting, text },
    });
  }

  const dms: { threadId: string; botId: string; text: string; error?: string }[] = [];
  const dmSeen = new Set<string>();
  for (const item of pendingDms) {
    const key = `${item.threadId}:${item.botId}`;
    if (dmSeen.has(key) || spoken.has(item.botId)) continue;
    dmSeen.add(key);
    const turn = await runBotTurn({
      ...input,
      ...bindTurn(input, item.botId),
      thread: { kind: "dm", id: item.threadId },
      permissionMode: input.permissionModeFor?.({ kind: "dm", id: item.threadId }),
      botId: item.botId,
      onStatus: input.onStatus,
      onEvent: input.onEvent
        ? (event) => input.onEvent!(item.botId, event)
        : undefined,
    });
    dms.push({
      threadId: item.threadId,
      botId: item.botId,
      text: turn.text,
      error: turn.error,
    });
    if (turn.error || !turn.text.trim()) continue;
    const other = item.threadId.split("__").find((id) => id !== item.botId);
    if (!other || other === "human") continue;
    await postToDm({
      store: input.store,
      nextId: input.nextId,
      now: input.now,
      from: { kind: "bot", botId: item.botId },
      to: { kind: "bot", botId: other },
      text: turn.text,
    });
  }

  return { woken: posted.woken, replies, dms, held };
}

export async function dispatchDm(
  input: DispatchBase & {
    from: Participant;
    to: Participant;
    text: string;
    threadId?: string;
  },
): Promise<{
  threadId: string;
  woken: string[];
  replies: { botId: string; text: string; error?: string }[];
}> {
  const posted = await postToDm({
    store: input.store,
    nextId: input.nextId,
    now: input.now,
    from: input.from,
    to: input.to,
    text: input.text,
    threadId: input.threadId,
  });
  input.onWoken?.(posted.woken);
  const replies: { botId: string; text: string; error?: string }[] = [];
  for (const botId of posted.woken) {
    const turn = await runBotTurn({
      ...input,
      ...bindTurn(input, botId),
      thread: { kind: "dm", id: posted.threadId },
      permissionMode: input.permissionModeFor?.({ kind: "dm", id: posted.threadId }),
      botId,
      onStatus: input.onStatus,
      onEvent: input.onEvent
        ? (event) => input.onEvent!(botId, event)
        : undefined,
    });
    replies.push({ botId, text: turn.text, error: turn.error });
    if (!turn.error && turn.text.trim()) {
      await postToDm({
        store: input.store,
        nextId: input.nextId,
        now: input.now,
        from: { kind: "bot", botId },
        to: input.from.kind === "bot" && input.from.botId === botId ? input.to : input.from,
        text: turn.text,
        threadId: posted.threadId,
      });
    }
  }
  return { threadId: posted.threadId, woken: posted.woken, replies };
}
