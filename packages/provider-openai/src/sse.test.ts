import { expect, test } from "bun:test";
import { parseSseChunk, splitSse } from "./sse";

test("splitSse extracts data frames", () => {
  const { frames, rest } = splitSse(
    'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\npartial',
  );
  expect(frames).toEqual([
    '{"choices":[{"delta":{"content":"hi"}}]}',
    "[DONE]",
  ]);
  expect(rest).toBe("partial");
});

test("parseSseChunk yields text and done", () => {
  const acc = new Map();
  expect(
    parseSseChunk('{"choices":[{"delta":{"content":"hi"}}]}', acc),
  ).toEqual([{ type: "text-delta", text: "hi" }]);
  expect(parseSseChunk("[DONE]", acc)).toEqual([{ type: "done" }]);
});

test("parseSseChunk yields reasoning-delta", () => {
  const acc = new Map();
  expect(
    parseSseChunk(
      '{"choices":[{"delta":{"reasoning":"let me think"}}]}',
      acc,
    ),
  ).toEqual([{ type: "reasoning-delta", text: "let me think" }]);
});

test("accumulates streamed tool call arguments", () => {
  const acc = new Map();
  parseSseChunk(
    JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: "c1", function: { name: "read", arguments: "{\"p" } },
            ],
          },
        },
      ],
    }),
    acc,
  );
  const end = parseSseChunk(
    JSON.stringify({
      choices: [
        {
          delta: { tool_calls: [{ index: 0, function: { arguments: "ath\":\"a\"}" } }] },
          finish_reason: "tool_calls",
        },
      ],
    }),
    acc,
  );
  expect(end).toEqual([
    { type: "tool-call", id: "c1", name: "read", arguments: '{"path":"a"}' },
  ]);
});
