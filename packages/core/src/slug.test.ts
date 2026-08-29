import { expect, test } from "bun:test";
import { assertBotId, assertSlug } from "./slug";

test("accepts lowercase slugs with digits and dashes", () => {
  assertSlug("lead");
  assertSlug("bot-2");
});

test("rejects empty, uppercase, and spaces", () => {
  expect(() => assertSlug("")).toThrow("invalid slug:");
  expect(() => assertSlug("Lead")).toThrow("invalid slug: Lead");
  expect(() => assertSlug("my bot")).toThrow("invalid slug:");
});

test("rejects reserved bot ids", () => {
  expect(() => assertBotId("human")).toThrow("reserved id: human");
  expect(() => assertBotId("everyone")).toThrow("reserved id: everyone");
  expect(() => assertBotId("user")).toThrow("reserved id: user");
  assertBotId("coder");
});
