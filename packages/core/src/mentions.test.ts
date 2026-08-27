import { expect, test } from "bun:test";
import { parseMentions } from "./mentions";

test("extracts member slugs after @", () => {
  expect(parseMentions("@designer hero yaz @coder api kur")).toEqual([
    "designer",
    "coder",
  ]);
});

test("is case-insensitive and lowercases slugs", () => {
  expect(parseMentions("hey @Designer and @CODER")).toEqual([
    "designer",
    "coder",
  ]);
});

test("keeps @everyone as a mention token", () => {
  expect(parseMentions("@everyone start")).toEqual(["everyone"]);
});

test("dedupes repeated mentions", () => {
  expect(parseMentions("@coder then @coder again")).toEqual(["coder"]);
});

test("ignores email-like text without a mention boundary", () => {
  expect(parseMentions("mail me at x@example.com then @tester")).toEqual([
    "tester",
  ]);
});
