import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fingerprint,
  loadAlways,
  matchesAlways,
  rememberAlways,
  saveAlways,
} from "./always";

test("same apply_patch path matches; other path does not", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-always-"));
  const a = { path: "src/a.ts" };
  const b = { path: "src/b.ts" };
  rememberAlways(dir, "apply_patch", a);
  const rules = loadAlways(dir);
  expect(matchesAlways(rules, "apply_patch", a)).toBe(true);
  expect(matchesAlways(rules, "apply_patch", b)).toBe(false);
  expect(fingerprint("apply_patch", a)).toContain("src/a.ts");
});

test("saveAlways round-trips", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-always-"));
  saveAlways(dir, [{ tool: "shell", key: 'shell:{"command":"npm test"}' }]);
  expect(loadAlways(dir)).toEqual([{ tool: "shell", key: 'shell:{"command":"npm test"}' }]);
});
