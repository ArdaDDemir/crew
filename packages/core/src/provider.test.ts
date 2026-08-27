import { expect, test } from "bun:test";
import { ScriptedProvider, type ChatEvent } from "./provider";

test("plays one script per complete() call", async () => {
  const provider = new ScriptedProvider([
    [
      { type: "text-delta", text: "hi" },
      { type: "done" },
    ],
    [
      { type: "tool-call", id: "1", name: "read", arguments: "{\"path\":\"a.txt\"}" },
      { type: "done" },
    ],
  ]);
  const first: ChatEvent[] = [];
  for await (const e of provider.complete({ model: "x", messages: [] })) first.push(e);
  const second: ChatEvent[] = [];
  for await (const e of provider.complete({ model: "x", messages: [] })) second.push(e);
  expect(first[0]).toEqual({ type: "text-delta", text: "hi" });
  expect(second[0]).toMatchObject({ type: "tool-call", name: "read" });
});
