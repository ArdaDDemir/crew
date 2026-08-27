import { postToChannel, postToDm, type Clock } from "./post";
import type { EventStore } from "./store";
import type { Workspace } from "./workspace";
import type { Provider } from "./provider";
import { runBotTurn, type AskFn, type Tool } from "./turn";
import type { ChatEvent } from "./provider";
import type { Participant } from "./router";

export type DispatchBase = Clock & {
  store: EventStore;
  workspace: Workspace;
  provider: Provider;
  tools: Tool[];
  model: string;
  workspaceRoot: string;
  ask: AskFn;
  hasReviewer: boolean;
  sleep?: (ms: number) => Promise<void>;
  turnGapMs?: number;
  rateLimitGapMs?: number;
  onStatus?: (message: string) => void;
  onEvent?: (botId: string, event: ChatEvent) => void;
};

function isRateLimit(error?: string): boolean {
  if (!error) return false;
  return /\b429\b/.test(error) || /rate-limit/i.test(error);
}

export async function dispatchChannelPost(
  input: DispatchBase & { channelId: string; text: string },
): Promise<{
  woken: string[];
  replies: { botId: string; text: string; error?: string }[];
}> {
  const posted = await postToChannel({
    store: input.store,
    workspace: input.workspace,
    nextId: input.nextId,
    now: input.now,
    channelId: input.channelId,
    post: { author: { kind: "human" }, text: input.text },
  });

  const replies: { botId: string; text: string; error?: string }[] = [];
  const queue = [...posted.woken];
  const spoken = new Set<string>();
  const sleep = input.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const rateGap = input.rateLimitGapMs ?? 0;
  let safety = 0;
  let previousWaveHadRateLimit = false;
  while (queue.length > 0 && safety < 8) {
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
          thread: { kind: "channel", id: input.channelId },
          botId,
          onStatus: input.onStatus,
          onEvent: input.onEvent
            ? (event) => input.onEvent!(botId, event)
            : undefined,
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
      queue.push(...fan.woken.filter((id) => !spoken.has(id)));
    }
  }

  return { woken: posted.woken, replies };
}

export async function dispatchDm(
  input: DispatchBase & { from: Participant; to: Participant; text: string },
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
  });
  const replies: { botId: string; text: string; error?: string }[] = [];
  for (const botId of posted.woken) {
    const turn = await runBotTurn({
      ...input,
      thread: { kind: "dm", id: posted.threadId },
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
      });
    }
  }
  return { threadId: posted.threadId, woken: posted.woken, replies };
}
