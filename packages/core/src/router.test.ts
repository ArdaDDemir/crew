import { expect, test } from "bun:test";
import { routeWakes, type Channel, type Post } from "./router";

const landing: Channel = {
  id: "landing",
  leadBotId: "lead",
  memberBotIds: ["lead", "designer", "coder", "tester"],
};

test("wakes only mentioned member bots, in parallel-ready list", () => {
  const post: Post = {
    author: { kind: "human" },
    text: "@designer hero yaz. Aynı anda @coder API kur. Diğerleri beklesin.",
  };
  const decision = routeWakes(landing, post);
  expect(decision.woken).toEqual(["designer", "coder"]);
  expect(decision.mentions).toEqual(["designer", "coder"]);
});

test("unmentioned bots wait — tester is not woken without @tester", () => {
  const post: Post = {
    author: { kind: "human" },
    text: "@designer çiz. Tester sonra bakacak ama etiket yok.",
  };
  expect(routeWakes(landing, post).woken).toEqual(["designer"]);
});

test("human post with no mention wakes the lead", () => {
  const post: Post = { author: { kind: "human" }, text: "landing sayfasını çıkar" };
  expect(routeWakes(landing, post).woken).toEqual(["lead"]);
});

test("human post with no mention and no lead wakes nobody", () => {
  const room: Channel = { id: "idle", memberBotIds: ["designer", "coder"] };
  const post: Post = { author: { kind: "human" }, text: "hello" };
  expect(routeWakes(room, post).woken).toEqual([]);
});

test("mentions of non-members are ignored for waking", () => {
  const post: Post = {
    author: { kind: "human" },
    text: "@designer and @intern who is not in this channel",
  };
  expect(routeWakes(landing, post).woken).toEqual(["designer"]);
});

test("bot post does not auto-wake the author", () => {
  const post: Post = {
    author: { kind: "bot", botId: "lead" },
    text: "@designer hero @coder api",
  };
  expect(routeWakes(landing, post).woken).toEqual(["designer", "coder"]);
});

test("@everyone wakes every bot member except the author", () => {
  const post: Post = {
    author: { kind: "bot", botId: "lead" },
    text: "@everyone status",
  };
  expect(routeWakes(landing, post).woken).toEqual([
    "designer",
    "coder",
    "tester",
  ]);
});

test("human @everyone wakes every bot member", () => {
  const post: Post = { author: { kind: "human" }, text: "@everyone go" };
  expect(routeWakes(landing, post).woken).toEqual([
    "lead",
    "designer",
    "coder",
    "tester",
  ]);
});
