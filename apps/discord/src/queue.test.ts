import { expect, test } from "bun:test";
import { createDiscordQueue, retryAfterMs } from "./queue";

test("retryAfterMs prefers JSON retry_after seconds, then Retry-After, then X-RateLimit-Reset-After", async () => {
  expect(
    await retryAfterMs(
      new Response(JSON.stringify({ retry_after: 1.5, message: "slow" }), {
        status: 429,
        headers: { "Retry-After": "9", "X-RateLimit-Reset-After": "8" },
      }),
    ),
  ).toBe(1500);
  expect(
    await retryAfterMs(
      new Response("nope", {
        status: 429,
        headers: { "Retry-After": "2" },
      }),
    ),
  ).toBe(2000);
  expect(
    await retryAfterMs(
      new Response(null, {
        status: 429,
        headers: { "X-RateLimit-Reset-After": "0.25" },
      }),
    ),
  ).toBe(250);
});

test("queue retries 429 using Retry-After and does not block enqueue", async () => {
  const sleeps: number[] = [];
  const hits: string[] = [];
  let n = 0;
  const q = createDiscordQueue({
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  let finished = false;
  q.enqueue("https://discord.com/api/webhooks/1/tok", async () => {
    n += 1;
    hits.push(`try${n}`);
    if (n === 1) {
      return new Response(JSON.stringify({ retry_after: 0.01 }), {
        status: 429,
        headers: { "Retry-After": "0.01" },
      });
    }
    finished = true;
    return new Response(null, { status: 204 });
  });
  expect(finished).toBe(false);
  await q.idle();
  expect(hits).toEqual(["try1", "try2"]);
  expect(sleeps[0]).toBe(10);
  expect(finished).toBe(true);
});

test("queue serializes one destination and lets two destinations overlap", async () => {
  const order: string[] = [];
  const q = createDiscordQueue({ sleep: async () => {} });
  let releaseA!: () => void;
  const gateA = new Promise<void>((r) => {
    releaseA = r;
  });
  q.enqueue("a", async () => {
    order.push("a1");
    await gateA;
    order.push("a1done");
    return new Response(null, { status: 204 });
  });
  q.enqueue("a", async () => {
    order.push("a2");
    return new Response(null, { status: 204 });
  });
  q.enqueue("b", async () => {
    order.push("b1");
    return new Response(null, { status: 204 });
  });
  await new Promise((r) => setTimeout(r, 20));
  expect(order).toContain("a1");
  expect(order).toContain("b1");
  expect(order).not.toContain("a2");
  releaseA();
  await q.idle();
  expect(order.indexOf("a2")).toBeGreaterThan(order.indexOf("a1done"));
});

test("queue calls onDrop after eight 429s and does not throw", async () => {
  const dropped: string[] = [];
  let n = 0;
  const q = createDiscordQueue({
    sleep: async () => {},
    onDrop: (dest) => dropped.push(dest),
  });
  q.enqueue("https://discord.com/api/webhooks/1/tok", async () => {
    n += 1;
    return new Response(JSON.stringify({ retry_after: 0 }), {
      status: 429,
      headers: { "Retry-After": "0" },
    });
  });
  await q.idle();
  expect(n).toBe(8);
  expect(dropped).toEqual(["https://discord.com/api/webhooks/1/tok"]);
});
