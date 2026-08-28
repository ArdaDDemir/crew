import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  archiveDm,
  deleteDm,
  loadDmPrefs,
  parseDmPrefsBody,
  saveDmPrefs,
  unarchiveDm,
} from "./dm-prefs";

test("save and load archive and delete lists", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-dm-"));
  expect(loadDmPrefs(cwd)).toEqual({ archived: [], deleted: [] });
  saveDmPrefs(cwd, { archived: ["human__coder__t1"], deleted: ["human__coder__t2"] });
  expect(loadDmPrefs(cwd)).toEqual({
    archived: ["human__coder__t1"],
    deleted: ["human__coder__t2"],
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
});
