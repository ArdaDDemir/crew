/** Cubicles live left of the glass. You lives in the bottom aisle. No isometric stagger. */

export const GLASS_X = 198;

export function deskLayout(n) {
  const count = Math.max(1, n);
  const cols = 2;
  return {
    cols,
    cellW: 86,
    cellH: 70,
    rows: Math.ceil(count / cols),
    glassX: GLASS_X,
  };
}

export function deskSlot(i, n) {
  const { cols, cellW, cellH } = deskLayout(n ?? 1);
  const col = i % cols;
  const row = Math.floor(i / cols);
  return {
    x: 30 + col * cellW,
    y: 84 + row * cellH,
    z: 8 + row * 5 + col,
  };
}

export function youHome(n) {
  const { cellH, rows } = deskLayout(n ?? 1);
  return { x: 38, y: 84 + rows * cellH + 12 };
}

export function tableSlot(i) {
  const col = i % 2;
  const row = Math.floor(i / 2);
  return {
    x: 208 + col * 28,
    y: 48 + row * 24,
    z: 24 + row,
  };
}
