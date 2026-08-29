import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FLOOR_KINDS,
  MAX_FURNITURE,
  loadFloor,
  parseFurniture,
  saveFloor,
} from "./floor";

test("missing floor.json is empty and is not written", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-floor-"));
  expect(loadFloor(cwd, "landing")).toEqual({ channelId: "landing", furniture: [] });
  expect(existsSync(join(cwd, ".crew", "floor.json"))).toBe(false);
});

test("saveFloor keeps allowed kinds, clamps coords, caps at 24, never writes config.json", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-floor-"));
  const saved = saveFloor(cwd, "landing", {
    furniture: [
      { id: "p1", kind: "plant", x: -4, y: 900 },
      { id: "nope", kind: "dragon", x: 10, y: 10 },
      { id: "l1", kind: "lamp", x: 40, y: 80 },
    ],
  });
  expect(saved.furniture.map((f) => f.kind).sort()).toEqual(["lamp", "plant"]);
  expect(saved.furniture.find((f) => f.kind === "plant")?.x).toBe(0);
  expect(saved.furniture.find((f) => f.kind === "plant")?.y).toBeLessThanOrEqual(220);
  expect(existsSync(join(cwd, ".crew", "config.json"))).toBe(false);
  const disk = loadFloor(cwd, "landing");
  expect(disk.furniture).toHaveLength(2);

  const many = Array.from({ length: 30 }, (_, i) => ({
    id: `n${i}`,
    kind: "rug" as const,
    x: i,
    y: i,
  }));
  expect(saveFloor(cwd, "landing", { furniture: many }).furniture).toHaveLength(MAX_FURNITURE);
  expect(FLOOR_KINDS).toContain("sofa");
  expect(parseFurniture([{ kind: "shelf", x: 1, y: 2, id: "s1" }])).toHaveLength(1);
});
