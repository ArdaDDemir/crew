import { expect, test } from "bun:test";
import { HarnessCliProvider } from "./harness-provider";

test("Claude complete streams assistant text", async () => {
  const argvLog: string[][] = [];
  const provider = new HarnessCliProvider({
    kind: "claude",
    binary: "claude",
    cwd: "/proj",
    writePrompt: async () => "/tmp/p.txt",
    unlinkPrompt: async () => {},
    run: async function* (argv) {
      argvLog.push(argv);
      yield '{"type":"assistant","message":{"content":[{"type":"text","text":"I edited hero copy."}]}}';
      yield '{"type":"result","subtype":"success","result":"I edited hero copy."}';
      return 0;
    },
  });
  const texts: string[] = [];
  for await (const e of provider.complete({
    model: "sonnet",
    messages: [{ role: "user", content: "human: @coder ping" }],
  })) {
    if (e.type === "text-delta") texts.push(e.text);
  }
  expect(texts).toEqual(["I edited hero copy."]);
  expect(argvLog[0]?.includes("-p")).toBe(true);
  expect(argvLog[0]?.includes("stream-json")).toBe(true);
});

test("Codex complete streams item.completed", async () => {
  const provider = new HarnessCliProvider({
    kind: "codex",
    binary: "codex",
    cwd: "/proj",
    writePrompt: async () => "/tmp/p.txt",
    unlinkPrompt: async () => {},
    run: async function* () {
      yield '{"type":"item.completed","item":{"type":"agentMessage","text":"tests pass"}}';
      return 0;
    },
  });
  const texts: string[] = [];
  for await (const e of provider.complete({
    model: "gpt-5.6-sol",
    messages: [{ role: "user", content: "hi" }],
  })) {
    if (e.type === "text-delta") texts.push(e.text);
  }
  expect(texts).toEqual(["tests pass"]);
});

test("OpenCode complete streams text parts", async () => {
  const provider = new HarnessCliProvider({
    kind: "opencode",
    binary: "opencode",
    cwd: "/proj",
    writePrompt: async () => "/tmp/p.txt",
    unlinkPrompt: async () => {},
    run: async function* () {
      yield '{"type":"text","part":{"text":"shipped landing"}}';
      return 0;
    },
  });
  const texts: string[] = [];
  for await (const e of provider.complete({
    model: "",
    messages: [{ role: "user", content: "hi" }],
  })) {
    if (e.type === "text-delta") texts.push(e.text);
  }
  expect(texts).toEqual(["shipped landing"]);
});
