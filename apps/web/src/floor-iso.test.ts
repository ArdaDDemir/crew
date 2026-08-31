import { expect, test } from "bun:test";
import {
  assignDesks,
  buildBlocked,
  deskSlot,
  doorSlots,
  findPath,
  inRoom,
  iso,
  screenToTile,
  tableSlot,
} from "../public/floor-iso.js";

test("iso projection and inverse pick roundtrip on tile centers", () => {
  for (const [x, y] of [
    [0, 0],
    [5, 3],
    [12, 8],
  ]) {
    const s = iso(x, y);
    const t = screenToTile(s.x + 0, s.y + 8); // +half tile height = tile center
    expect(t.x).toBe(x);
    expect(t.y).toBe(y);
  }
});

test("inRoom bounds the grid", () => {
  expect(inRoom(0, 0)).toBe(true);
  expect(inRoom(12, 8)).toBe(true);
  expect(inRoom(13, 8)).toBe(false);
  expect(inRoom(-1, 2)).toBe(false);
});

test("desk slots are unique per member index", () => {
  const seen = new Set();
  for (let i = 0; i < 10; i++) {
    const s = deskSlot(i);
    const key = `${s.x},${s.y}`;
    expect(seen.has(key)).toBe(false);
    seen.add(key);
  }
});

test("table slots stay inside the glass bay and do not collide with desks", () => {
  const desks = new Set();
  for (let i = 0; i < 10; i++) desks.add(`${deskSlot(i).x},${deskSlot(i).y}`);
  for (let i = 0; i < 5; i++) {
    const s = tableSlot(i);
    expect(desks.has(`${s.x},${s.y}`)).toBe(false);
    expect(s.x).toBeGreaterThan(6);
  }
});

test("door slots stay on the back row and do not overlap", () => {
  const slots = doorSlots(4);
  expect(slots.length).toBe(4);
  const seen = new Set();
  for (const s of slots) {
    expect(s.y).toBe(0);
    expect(seen.has(s.x)).toBe(false);
    seen.add(s.x);
  }
});

test("findPath walks around desks to reach the goal", () => {
  const members = assignDesks(["a", "b", "c"]).map((row) => ({ ...row }));
  const blocked = buildBlocked({ members: members.map((m) => ({ desk: m.desk })) });
  const path = findPath({ x: 5, y: 1 }, { x: 1, y: 6 }, blocked);
  expect(Array.isArray(path)).toBe(true);
  expect(path[0]).toEqual({ x: 5, y: 1 });
  expect(path.at(-1)).toEqual({ x: 1, y: 6 });
  for (const step of path) {
    expect(blocked.has(`${step.x},${step.y}`)).toBe(false);
  }
});

test("findPath returns null for an unreachable or out-of-room goal", () => {
  const blocked = buildBlocked({ members: [], furniture: [{ x: 1, y: 0 }, { x: 0, y: 1 }], doors: [{ x: 2, y: 0 }] });
  const cornered = { x: 0, y: 0 };
  expect(findPath(cornered, { x: 50, y: 50 }, blocked)).toBeNull();
  expect(findPath(cornered, { x: 0, y: 0 }, blocked)).toEqual([cornered]);
});

test("assignDesks is stable across member order", () => {
  const a = assignDesks(["b", "a"]);
  const b = assignDesks(["a", "b"]);
  expect(a.map((r) => r.id)).toEqual(["a", "b"]);
  expect(a.map((r) => r.desk.x)).toEqual(b.map((r) => r.desk.x));
});
