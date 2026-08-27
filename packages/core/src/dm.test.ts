import { expect, test } from "bun:test";
import { routeDmWake, type DmThread, type Post } from "./router";

const leadDesigner: DmThread = {
  id: "designer__lead",
  participants: [
    { kind: "bot", botId: "lead" },
    { kind: "bot", botId: "designer" },
  ],
};

const humanCoder: DmThread = {
  id: "coder__human",
  participants: [{ kind: "human" }, { kind: "bot", botId: "coder" }],
};

test("bot-to-bot DM wakes the other bot, not the author", () => {
  const post: Post = {
    author: { kind: "bot", botId: "lead" },
    text: "hero spec attached, implement colors",
  };
  expect(routeDmWake(leadDesigner, post).woken).toEqual(["designer"]);
});

test("human-to-bot DM wakes that bot without needing @", () => {
  const post: Post = { author: { kind: "human" }, text: "fix the login" };
  expect(routeDmWake(humanCoder, post).woken).toEqual(["coder"]);
});

test("mentions inside a DM do not wake channel members", () => {
  const post: Post = {
    author: { kind: "bot", botId: "lead" },
    text: "@tester this is not a channel",
  };
  expect(routeDmWake(leadDesigner, post).woken).toEqual(["designer"]);
});
