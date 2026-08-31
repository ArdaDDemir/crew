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

test("assistant tool_calls are sent in OpenAI function shape", async () => {
  let body = "";
  const sse =
    'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n' + "data: [DONE]\n\n";
  const provider = new OpenAICompatProvider({
    apiKey: "test",
    fetch: async (_url, init) => {
      body = String(init?.body ?? "");
      return new Response(sse, { status: 200 });
    },
  });
  for await (const _ of provider.complete({
    model: "x",
    messages: [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            name: "read",
            arguments: JSON.stringify({ path: "index.html" }),
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "<html/>" },
    ],
  })) {
    /* drain */
  }
  const parsed = JSON.parse(body) as {
    messages: Array<{
      tool_calls?: Array<{
        type?: string;
        function?: { name?: string; arguments?: string };
        name?: string;
      }>;
      tool_call_id?: string;
    }>;
  };
  const call = parsed.messages[0]?.tool_calls?.[0];
  expect(call?.type).toBe("function");
  expect(call?.function?.name).toBe("read");
  expect(call?.name).toBeUndefined();
  expect(parsed.messages[1]?.tool_call_id).toBe("call_1");
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

test("reasoning_effort rides in the body only when set", async () => {
  const bodies: string[] = [];
  const sse =
    'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n' + "data: [DONE]\n\n";
  const provider = new OpenAICompatProvider({
    apiKey: "test",
    fetch: async (_url, init) => {
      bodies.push(String(init?.body ?? ""));
      return new Response(sse, { status: 200 });
    },
  });
  for await (const _ of provider.complete({ model: "x", messages: [], effort: "high" })) {
    /* drain */
  }
  for await (const _ of provider.complete({ model: "x", messages: [] })) {
    /* drain */
  }
  const withEffort = JSON.parse(bodies[0]!) as { reasoning_effort?: string };
  const without = JSON.parse(bodies[1]!) as { reasoning_effort?: string };
  expect(withEffort.reasoning_effort).toBe("high");
  expect("reasoning_effort" in without).toBe(false);
});
