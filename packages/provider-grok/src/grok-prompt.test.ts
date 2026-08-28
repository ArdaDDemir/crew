import { expect, test } from "bun:test";
import { buildGrokArgv, flattenGrokPrompt } from "./grok-prompt";

test("flattenGrokPrompt drops Crew tool list and keeps soul plus transcript", () => {
  const out = flattenGrokPrompt([
    {
      role: "system",
      content: "You are Coder.\n\n# Tools\n- read\n- apply_patch",
    },
    { role: "user", content: "human: ping @coder" },
    { role: "assistant", content: "pong" },
  ]);
  expect(out).toContain("You are Coder.");
  expect(out).not.toContain("# Tools");
  expect(out).not.toContain("apply_patch");
  expect(out).toContain("human: ping @coder");
  expect(out).toContain("assistant: pong");
  expect(out).toContain("first-person English account");
});

test("buildGrokArgv is headless spawn flags", () => {
  const argv = buildGrokArgv({
    binary: "C:\\\\grok.exe",
    cwd: "D:\\\\proj",
    promptFile: "C:\\\\tmp\\\\p.txt",
    model: "grok-4.6",
  });
  expect(argv[0]).toBe("C:\\\\grok.exe");
  expect(argv).toContain("--prompt-file");
  expect(argv).toContain("C:\\\\tmp\\\\p.txt");
  expect(argv).toContain("--output-format");
  expect(argv).toContain("streaming-json");
  expect(argv).toContain("--always-approve");
  expect(argv).toContain("--verbatim");
  expect(argv).toContain("--cwd");
  expect(argv).toContain("D:\\\\proj");
  expect(argv).toContain("-m");
  expect(argv).toContain("grok-4.6");
  expect(argv).toContain("--deny");
});
