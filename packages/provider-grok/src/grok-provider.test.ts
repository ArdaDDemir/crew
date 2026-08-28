import { expect, test } from "bun:test";
import { GrokCliProvider, type GrokRunner } from "./grok-provider";

function scripted(lines: string[], code = 0): GrokRunner {
  return async function* (_argv, _opts) {
    for (const line of lines) yield line;
    return code;
  };
}

test("complete streams Grok NDJSON as ChatEvents", async () => {
  const argvLog: string[][] = [];
  const provider = new GrokCliProvider({
    binary: "grok",
    cwd: "/proj",
    writePrompt: async () => "/tmp/p.txt",
    unlinkPrompt: async () => {},
    run: async function* (argv, opts) {
      argvLog.push(argv);
      expect(opts.cwd).toBe("/proj");
      yield '{"type":"thought","data":"look"}';
      yield '{"type":"text","data":"I patched index.html."}';
      yield '{"type":"end","stopReason":"end_turn"}';
      return 0;
    },
  });
  const events = [];
  for await (const e of provider.complete({
    model: "grok-4.6",
    messages: [
      { role: "system", content: "You are Coder.\n\n# Tools\n- read" },
      { role: "user", content: "human: @coder ping" },
    ],
  })) {
    events.push(e);
  }
  expect(events).toEqual([
    { type: "reasoning-delta", text: "look" },
    { type: "text-delta", text: "I patched index.html." },
    { type: "done" },
  ]);
  expect(argvLog[0]?.includes("--prompt-file")).toBe(true);
  expect(argvLog[0]?.includes("grok-4.6")).toBe(true);
});

test("non-zero exit without text is an error", async () => {
  const provider = new GrokCliProvider({
    binary: "grok",
    cwd: "/proj",
    writePrompt: async () => "/tmp/p.txt",
    unlinkPrompt: async () => {},
    run: scripted(['{"type":"error","message":"not logged in"}'], 1),
  });
  const events = [];
  for await (const e of provider.complete({
    model: "grok-4.6",
    messages: [{ role: "user", content: "hi" }],
  })) {
    events.push(e);
  }
  expect(events[0]).toMatchObject({ type: "error", message: "not logged in" });
  expect(events.at(-1)).toEqual({ type: "done" });
});
