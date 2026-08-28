import { expect, test } from "bun:test";
import { parseHarnessLine } from "./parse";

test("parses Grok streaming-json", () => {
  expect(parseHarnessLine("grok", '{"type":"text","data":"hi"}')).toEqual({
    type: "text-delta",
    text: "hi",
  });
  expect(parseHarnessLine("grok", '{"type":"tool_call"}')).toBeNull();
});

test("parses Claude stream-json assistant text and thinking, skips duplicate result", () => {
  expect(
    parseHarnessLine(
      "claude",
      '{"type":"assistant","message":{"content":[{"type":"text","text":"I patched it."},{"type":"thinking","thinking":"look"}]}}',
    ),
  ).toEqual({ type: "text-delta", text: "I patched it." });
  expect(
    parseHarnessLine("claude", '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"look"}]}}'),
  ).toEqual({ type: "reasoning-delta", text: "look" });
  expect(parseHarnessLine("claude", '{"type":"result","subtype":"success","result":"I patched it."}')).toEqual({
    type: "text-delta",
    text: "I patched it.",
  });
  expect(parseHarnessLine("claude", '{"type":"result","is_error":true,"result":"auth failed"}')).toEqual({
    type: "error",
    message: "auth failed",
  });
  expect(parseHarnessLine("claude", '{"type":"tool_use"}')).toBeNull();
});

test("parses Codex exec --json agent messages", () => {
  expect(
    parseHarnessLine(
      "codex",
      '{"type":"item.completed","item":{"type":"agentMessage","text":"done"}}',
    ),
  ).toEqual({ type: "text-delta", text: "done" });
  expect(parseHarnessLine("codex", '{"type":"item.agentMessage.delta","delta":"he"}')).toEqual({
    type: "text-delta",
    text: "he",
  });
  expect(
    parseHarnessLine("codex", '{"method":"item/agentMessage/delta","params":{"delta":"llo"}}'),
  ).toEqual({ type: "text-delta", text: "llo" });
  expect(parseHarnessLine("codex", '{"type":"turn.failed","error":{"message":"quota"}}')).toEqual({
    type: "error",
    message: "quota",
  });
  expect(parseHarnessLine("codex", '{"type":"item.started","item":{"type":"commandExecution"}}')).toBeNull();
});

test("parses OpenCode run --format json text parts", () => {
  expect(parseHarnessLine("opencode", '{"type":"text","part":{"text":"shipped"}}')).toEqual({
    type: "text-delta",
    text: "shipped",
  });
  expect(parseHarnessLine("opencode", '{"type":"error","error":{"message":"no key"}}')).toEqual({
    type: "error",
    message: "no key",
  });
  expect(parseHarnessLine("opencode", '{"type":"tool_use"}')).toBeNull();
});
