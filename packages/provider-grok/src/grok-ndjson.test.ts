import { expect, test } from "bun:test";
import { parseGrokLine } from "./grok-ndjson";

test("maps Grok streaming-json text and thought, ignores tool_call", () => {
  expect(parseGrokLine('{"type":"text","data":"hello"}')).toEqual({
    type: "text-delta",
    text: "hello",
  });
  expect(parseGrokLine('{"type":"thought","data":"hmm"}')).toEqual({
    type: "reasoning-delta",
    text: "hmm",
  });
  expect(parseGrokLine('{"type":"tool_call","toolName":"read_file"}')).toBeNull();
  expect(parseGrokLine('{"type":"tool_call_update","status":"completed"}')).toBeNull();
  expect(parseGrokLine('{"type":"end","stopReason":"end_turn"}')).toBeNull();
  expect(parseGrokLine('{"type":"error","message":"auth failed"}')).toEqual({
    type: "error",
    message: "auth failed",
  });
});

test("skips blank and non-JSON lines", () => {
  expect(parseGrokLine("")).toBeNull();
  expect(parseGrokLine("not json")).toBeNull();
});
