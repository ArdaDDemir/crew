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

test("keeps a trailing-punctuation mention", () => {
  expect(parseMentions("go @coder.")).toEqual(["coder"]);
});

test("does not treat a URL path @ as a wake", () => {
  expect(parseMentions("see https://github.com/@tester/repo then @coder")).toEqual(
    ["coder"],
  );
});

test("does not wake @ inside a fenced code block", () => {
  expect(parseMentions("see\n```\n@tester\n```\nthen @coder")).toEqual(["coder"]);
});

test("does not wake @ inside inline code", () => {
  expect(parseMentions("use `@tester` then @coder")).toEqual(["coder"]);
});

test("does not wake @ inside a tilde fence", () => {
  expect(parseMentions("see\n~~~\n@tester\n~~~\nthen @coder")).toEqual(["coder"]);
});

test("unclosed fence masks through end of text", () => {
  expect(parseMentions("start @coder\n```\n@tester")).toEqual(["coder"]);
});
