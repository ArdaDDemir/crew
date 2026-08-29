import { expect, test } from "bun:test";
import {
  askCardPayload,
  decisionFromCustomId,
  decideAskClick,
} from "./ask";

test("ask card has Allow Always Deny custom ids", () => {
  const body = askCardPayload("coder", "apply_patch", { path: "index.html" });
  expect(body.content).toMatch(/@coder/);
  expect(body.content).toMatch(/apply_patch/);
  expect(body.content).toMatch(/index.html/);
  const ids = body.components[0]?.components.map((c) => c.custom_id);
  expect(ids).toEqual(["crew:allow", "crew:always", "crew:deny"]);
});

test("decisionFromCustomId reads crew allow always deny", () => {
  expect(decisionFromCustomId("crew:allow")).toBe("allow");
  expect(decisionFromCustomId("crew:always")).toBe("always");
  expect(decisionFromCustomId("crew:deny")).toBe("deny");
  expect(decisionFromCustomId("nope")).toBeUndefined();
});

test("ask click only the waking human may decide", () => {
  expect(
    decideAskClick({
      customId: "crew:allow",
      clickerId: "222",
      authorId: "222",
    }),
  ).toBe("allow");
  expect(
    decideAskClick({
      customId: "crew:deny",
      clickerId: "999",
      authorId: "222",
    }),
  ).toBeUndefined();
});
