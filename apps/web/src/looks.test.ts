import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HAIR, SKIN, TOP, loadLooks, parseLook, saveLook } from "./looks";

test("missing looks.json is empty and is not written", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-looks-"));
  expect(loadLooks(cwd)).toEqual({ bots: {}, humans: {} });
  expect(existsSync(join(cwd, ".crew", "looks.json"))).toBe(false);
});

test("saveLook stores one bot or human; junk kinds dropped; not config.json", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-looks-"));
  const bot = saveLook(cwd, { botId: "coder", skin: "dark", hair: "ponytail", top: "hoodie" });
  expect(bot.bots.coder).toEqual({ skin: "dark", hair: "ponytail", top: "hoodie" });
  const human = saveLook(cwd, { humanId: "arda", skin: "nope", hair: "buzz", top: "dragon" });
  expect(human.humans.arda).toEqual({ skin: "mid", hair: "buzz", top: "tee" });
  expect(existsSync(join(cwd, ".crew", "config.json"))).toBe(false);
  expect(parseLook({ skin: "light", hair: "none", top: "sweater" })).toEqual({
    skin: "light",
    hair: "none",
    top: "sweater",
  });
  expect(SKIN).toContain("light");
  expect(HAIR).toContain("curly");
  expect(TOP).toContain("polo");
});
