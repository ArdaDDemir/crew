import { expect, test } from "bun:test";
import { dmThreadId, parseDmThreadId } from "./events";

test("dmThreadId human and bot-bot stay two-part", () => {
  expect(dmThreadId({ kind: "human" }, { kind: "bot", botId: "coder" })).toBe(
    "human__coder",
  );
  expect(
    dmThreadId({ kind: "bot", botId: "tester" }, { kind: "bot", botId: "designer" }),
  ).toBe("designer__tester");
});

test("parseDmThreadId reads legacy and extra conversations", () => {
  expect(parseDmThreadId("human__coder")).toEqual({
    pair: "human__coder",
    conv: "",
    withHuman: true,
    left: "human",
    right: "coder",
  });
  expect(parseDmThreadId("human__coder__tabc12")).toEqual({
    pair: "human__coder",
    conv: "tabc12",
    withHuman: true,
    left: "human",
    right: "coder",
  });
  expect(parseDmThreadId("designer__tester")).toEqual({
    pair: "designer__tester",
    conv: "",
    withHuman: false,
    left: "designer",
    right: "tester",
  });
});

test("parseDmThreadId rejects junk", () => {
  expect(() => parseDmThreadId("coder")).toThrow();
});
