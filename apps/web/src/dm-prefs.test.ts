import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  archiveDm,
  deleteDm,
  ensureDmMode,
  loadDmPrefs,
  parseDmPrefsBody,
  saveDmPrefs,
  setDmMode,
  unarchiveDm,
} from "./dm-prefs";

test("save and load archive and delete lists", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-dm-"));
  expect(loadDmPrefs(cwd)).toEqual({ archived: [], deleted: [], modes: {} });
  saveDmPrefs(cwd, { archived: ["human__coder__t1"], deleted: ["human__coder__t2"], modes: {} });
  expect(loadDmPrefs(cwd)).toEqual({
    archived: ["human__coder__t1"],
    deleted: ["human__coder__t2"],
    modes: {},
  });
});

test("archive unarchive delete mutate without dupes", () => {
  let prefs = parseDmPrefsBody({});
  prefs = archiveDm(prefs, "human__coder");
  prefs = archiveDm(prefs, "human__coder");
  expect(prefs.archived).toEqual(["human__coder"]);
  prefs = unarchiveDm(prefs, "human__coder");
  expect(prefs.archived).toEqual([]);
  prefs = archiveDm(prefs, "human__coder__t1");
  prefs = deleteDm(prefs, "human__coder__t1");
  expect(prefs.deleted).toEqual(["human__coder__t1"]);
  expect(prefs.archived).toEqual([]);
});

test("parse ignores junk ids", () => {
  const prefs = parseDmPrefsBody({
    archived: ["human__coder", "", 1, "human__coder"],
    deleted: ["nope"],
  });
  expect(prefs.archived).toEqual(["human__coder"]);
  expect(prefs.deleted).toEqual(["nope"]);
  expect(prefs.modes).toEqual({});
});

test("modes round-trip and ensureDmMode keeps the first write", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-dm-mode-"));
  let prefs = parseDmPrefsBody({
    modes: { human__coder: "supervised", bad: "nope" },
  });
  expect(prefs.modes).toEqual({ "human__coder": "supervised" });
  prefs = ensureDmMode(prefs, "human__coder__n1", "full-access");
  expect(prefs.modes["human__coder__n1"]).toBe("full-access");
  prefs = ensureDmMode(prefs, "human__coder__n1", "supervised");
  expect(prefs.modes["human__coder__n1"]).toBe("full-access");
  prefs = setDmMode(prefs, "human__coder__n1", "auto");
  expect(prefs.modes["human__coder__n1"]).toBe("auto");
  saveDmPrefs(cwd, prefs);
  expect(loadDmPrefs(cwd).modes["human__coder__n1"]).toBe("auto");
  prefs = archiveDm(prefs, "human__coder");
  expect(prefs.modes["human__coder"]).toBe("supervised");
});
