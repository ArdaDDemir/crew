import { expect, test } from "bun:test";
import { deskSlot, youHome, tableSlot, GLASS_X } from "../public/floor-layout.js";

test("cubicles stay left of the glass and do not sit on each other", () => {
  const a = deskSlot(0, 3);
  const b = deskSlot(1, 3);
  const c = deskSlot(2, 3);
  expect(a.x).toBeLessThan(GLASS_X);
  expect(b.x).toBeLessThan(GLASS_X);
  expect(c.x).toBeLessThan(GLASS_X);
  expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(70);
  expect(c.y).toBeGreaterThan(a.y + 50);
  const you = youHome(3);
  expect(you.y).toBeGreaterThan(c.y + 40);
  expect(you.x).toBeLessThan(GLASS_X);
  const meet = tableSlot(0);
  expect(meet.x).toBeGreaterThanOrEqual(GLASS_X);
  const packed = deskSlot(11, 12);
  expect(packed.x).toBeLessThan(GLASS_X);
});
