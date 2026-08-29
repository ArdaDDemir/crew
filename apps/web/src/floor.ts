import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const FLOOR_KINDS = ["plant", "lamp", "sofa", "shelf", "rug"] as const;
export type FloorKind = (typeof FLOOR_KINDS)[number];
export const MAX_FURNITURE = 24;

const KIND_SET = new Set<string>(FLOOR_KINDS);

export type FloorItem = {
  id: string;
  kind: FloorKind;
  x: number;
  y: number;
};

export type FloorRoom = {
  channelId: string;
  furniture: FloorItem[];
};

export type FloorFile = {
  rooms: Record<string, FloorItem[]>;
};

export function floorPath(cwd: string): string {
  return join(cwd, ".crew", "floor.json");
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function parseFurniture(raw: unknown): FloorItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FloorItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; kind?: unknown; x?: unknown; y?: unknown };
    const kind = String(row.kind ?? "").trim();
    if (!KIND_SET.has(kind)) continue;
    let id = String(row.id ?? "").trim();
    if (!id) id = `f${out.length + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      kind: kind as FloorKind,
      x: clamp(Number(row.x), 0, 320),
      y: clamp(Number(row.y), 0, 220),
    });
    if (out.length >= MAX_FURNITURE) break;
  }
  return out;
}

function parseFile(raw: unknown): FloorFile {
  const rooms: Record<string, FloorItem[]> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { rooms };
  const row = raw as { rooms?: unknown };
  if (!row.rooms || typeof row.rooms !== "object" || Array.isArray(row.rooms)) return { rooms };
  for (const [id, items] of Object.entries(row.rooms as Record<string, unknown>)) {
    const tid = id.trim();
    if (!tid) continue;
    rooms[tid] = parseFurniture(items);
  }
  return { rooms };
}

export function loadFloorFile(cwd: string): FloorFile {
  const path = floorPath(cwd);
  if (!existsSync(path)) return { rooms: {} };
  try {
    return parseFile(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return { rooms: {} };
  }
}

export function loadFloor(cwd: string, channelId: string): FloorRoom {
  const id = String(channelId ?? "").trim();
  const file = loadFloorFile(cwd);
  return { channelId: id, furniture: file.rooms[id] ?? [] };
}

export function saveFloor(
  cwd: string,
  channelId: string,
  input: { furniture: unknown },
): FloorRoom {
  const id = String(channelId ?? "").trim();
  const furniture = parseFurniture(input.furniture);
  const file = loadFloorFile(cwd);
  file.rooms[id] = furniture;
  const path = floorPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return { channelId: id, furniture };
}
