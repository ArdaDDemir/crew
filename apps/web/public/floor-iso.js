// Pure isometric floor math. No DOM, no canvas — bun-testable.

export const COLS = 13;
export const ROWS = 9;
export const TILE_W = 62;
export const TILE_H = 31;
export const ORIGIN_X = 40;
export const ORIGIN_Y = 46;

export function iso(x, y) {
  return {
    x: ORIGIN_X + (x - y) * (TILE_W / 2),
    y: ORIGIN_Y + (x + y) * (TILE_H / 2),
  };
}

export function screenToTile(px, py) {
  const dx = px - ORIGIN_X;
  const dy = py - ORIGIN_Y;
  const fx = (dy / (TILE_H / 2) + dx / (TILE_W / 2)) / 2;
  const fy = (dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2;
  return { x: Math.floor(fx), y: Math.floor(fy) };
}

export function inRoom(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < COLS && y < ROWS;
}

// Desk arc: members sit in a row on the middle-left, facing down-right (toward camera).
export function deskSlot(i) {
  const x = 2 + (i % 5);
  const y = 4 + Math.floor(i / 5);
  return { x, y };
}

// Table slot inside the glass bay for the currently-active member (writing/typing).
export function tableSlot(i) {
  const spots = [
    { x: 9, y: 5 },
    { x: 10, y: 5 },
    { x: 9, y: 6 },
    { x: 10, y: 6 },
    { x: 9, y: 4 },
  ];
  return spots[i % spots.length];
}

export function youHome(memberCount) {
  return { x: 5, y: memberCount > 4 ? 2 : 3 };
}

// Doors along the back wall (y = -1 visually), one per other channel.
export function doorSlots(count) {
  const out = [];
  const start = Math.max(1, COLS - 2 - (count - 1) * 2);
  for (let i = 0; i < count; i++) out.push({ x: start + i * 2, y: 0 });
  return out;
}

export function buildBlocked({ members, furniture, doors }) {
  const blocked = new Set();
  for (const m of members) {
    if (m.desk) blocked.add(`${m.desk.x},${m.desk.y}`);
    if (m.seat) blocked.add(`${m.seat.x},${m.seat.y}`);
  }
  for (const f of furniture ?? []) blocked.add(`${f.x},${f.y}`);
  for (const d of doors ?? []) blocked.add(`${d.x},${d.y}`);
  return blocked;
}

export function findPath(start, goal, blocked) {
  const sk = `${start.x},${start.y}`;
  const gk = `${goal.x},${goal.y}`;
  if (sk === gk) return [start];
  if (!inRoom(goal.x, goal.y)) return null;
  const prev = new Map([[sk, null]]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const ck = `${cur.x},${cur.y}`;
    if (ck === gk) break;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = `${nx},${ny}`;
      if (!inRoom(nx, ny) || prev.has(nk)) continue;
      if (nk !== gk && blocked.has(nk)) continue;
      prev.set(nk, ck);
      queue.push({ x: nx, y: ny });
    }
  }
  if (!prev.has(gk)) return null;
  const path = [];
  let k = gk;
  while (k) {
    const [x, y] = k.split(",").map(Number);
    path.push({ x, y });
    k = prev.get(k);
  }
  return path.reverse();
}

// Keep the desk row stable when members change: sorted by id, not arrival order.
export function assignDesks(memberIds) {
  return [...memberIds].sort().map((id, i) => ({ id, desk: deskSlot(i) }));
}

export function clampZoom(z) {
  return Math.min(2.2, Math.max(0.55, z));
}

export function walkDuration(tiles) {
  return Math.max(160, tiles * 130);
}
