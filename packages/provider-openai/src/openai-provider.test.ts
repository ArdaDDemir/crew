import { expect, test } from "bun:test";
import { OpenAICompatProvider } from "./openai-provider";

test("streams OpenAI-compatible SSE through the provider port", async () => {
  const sse =
    'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n' +
    "data: [DONE]\n\n";
  const provider = new OpenAICompatProvider({
    apiKey: "test",
    baseUrl: "https://example.test/v1",
    fetch: async () =>
      new Response(sse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
  });
  const texts: string[] = [];
  for await (const event of provider.complete({
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hi" }],
  })) {
    if (event.type === "text-delta") texts.push(event.text);
  }
  expect(texts).toEqual(["ok"]);
});

test("retries 429 then streams success", async () => {
  let calls = 0;
  const sse =
    'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n' + "data: [DONE]\n\n";
  const provider = new OpenAICompatProvider({
    apiKey: "test",
    retries: 2,
    sleep: async () => {},
    fetch: async () => {
      calls += 1;
      if (calls === 1) return new Response("rate", { status: 429 });
      return new Response(sse, { status: 200 });
    },
  });
  const texts: string[] = [];
  for await (const event of provider.complete({
    model: "x",
    messages: [],
  })) {
    if (event.type === "text-delta") texts.push(event.text);
  }
  expect(calls).toBe(2);
  expect(texts).toEqual(["ok"]);
});

test("hanging fetch becomes a timeout error", async () => {
  const provider = new OpenAICompatProvider({
    apiKey: "test",
    retries: 0,
    timeoutMs: 20,
    fetch: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
  });
  const events = [];
  for await (const event of provider.complete({ model: "x", messages: [] })) {
    events.push(event);
  }
  expect(events[0]).toMatchObject({ type: "error" });
  expect(String((events[0] as { message: string }).message)).toContain("timeout");
});

test("non-OK responses become error events", async () => {
  const provider = new OpenAICompatProvider({
    apiKey: "bad",
    fetch: async () => new Response("nope", { status: 401 }),
  });
  const types: string[] = [];
  for await (const event of provider.complete({
    model: "x",
    messages: [],
  })) {
    types.push(event.type);
    if (event.type === "error") expect(event.message).toContain("401");
    if (event.type === "error") expect(event.message).not.toContain("user_id");
  }
  expect(types).toEqual(["error", "done"]);
});
