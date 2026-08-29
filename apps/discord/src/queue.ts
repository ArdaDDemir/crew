export type DiscordQueue = {
  enqueue(dest: string, send: () => Promise<Response | void>): void;
  idle(): Promise<void>;
};

export async function retryAfterMs(res: Response): Promise<number> {
  let body: unknown;
  try {
    body = await res.clone().json();
  } catch {
    body = undefined;
  }
  const fromBody = Number(
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { retry_after?: unknown }).retry_after
      : undefined,
  );
  if (Number.isFinite(fromBody) && fromBody >= 0) return Math.ceil(fromBody * 1000);
  const header = res.headers.get("Retry-After") ?? res.headers.get("retry-after");
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs) && secs >= 0) return Math.ceil(secs * 1000);
    const when = Date.parse(header);
    if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  }
  const reset =
    res.headers.get("X-RateLimit-Reset-After") ?? res.headers.get("x-ratelimit-reset-after");
  if (reset) {
    const secs = Number(reset);
    if (Number.isFinite(secs) && secs >= 0) return Math.ceil(secs * 1000);
  }
  return 1000;
}

export function createDiscordQueue(opts?: {
  sleep?: (ms: number) => Promise<void>;
  onDrop?: (dest: string) => void;
}): DiscordQueue {
  const sleep = opts?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const tails = new Map<string, Promise<void>>();
  const inFlight = new Set<Promise<void>>();

  const runSend = async (
    dest: string,
    send: () => Promise<Response | void>,
  ): Promise<void> => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const res = await send();
      if (!res || res.status !== 429) return;
      if (attempt === 7) {
        opts?.onDrop?.(dest);
        return;
      }
      await sleep(await retryAfterMs(res));
    }
  };

  return {
    enqueue(dest: string, send: () => Promise<Response | void>) {
      const key = String(dest ?? "").trim() || "default";
      const prev = tails.get(key) ?? Promise.resolve();
      const next = prev
        .catch(() => undefined)
        .then(() => runSend(key, send))
        .catch(() => undefined);
      tails.set(key, next);
      inFlight.add(next);
      void next.finally(() => inFlight.delete(next));
    },
    async idle() {
      while (inFlight.size) {
        await Promise.all([...inFlight]);
      }
    },
  };
}
