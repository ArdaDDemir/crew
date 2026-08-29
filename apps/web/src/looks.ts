import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const SKIN = ["light", "mid", "dark"] as const;
export const HAIR = ["short", "ponytail", "buzz", "curly", "none"] as const;
export const TOP = ["hoodie", "tee", "polo", "sweater"] as const;

export type Look = {
  skin: (typeof SKIN)[number];
  hair: (typeof HAIR)[number];
  top: (typeof TOP)[number];
};

export type LooksFile = {
  bots: Record<string, Look>;
  humans: Record<string, Look>;
};

const SKIN_SET = new Set<string>(SKIN);
const HAIR_SET = new Set<string>(HAIR);
const TOP_SET = new Set<string>(TOP);

export function looksPath(cwd: string): string {
  return join(cwd, ".crew", "looks.json");
}

export function parseLook(raw: unknown): Look {
  const row = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const skin = SKIN_SET.has(String(row.skin ?? "")) ? (row.skin as Look["skin"]) : "mid";
  const hair = HAIR_SET.has(String(row.hair ?? "")) ? (row.hair as Look["hair"]) : "short";
  const top = TOP_SET.has(String(row.top ?? "")) ? (row.top as Look["top"]) : "tee";
  return { skin, hair, top };
}

function parseMap(raw: unknown): Record<string, Look> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Look> = {};
  for (const [id, look] of Object.entries(raw as Record<string, unknown>)) {
    const tid = id.trim();
    if (!tid) continue;
    out[tid] = parseLook(look);
  }
  return out;
}

export function parseLooks(raw: unknown): LooksFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { bots: {}, humans: {} };
  const row = raw as { bots?: unknown; humans?: unknown };
  return { bots: parseMap(row.bots), humans: parseMap(row.humans) };
}

export function loadLooks(cwd: string): LooksFile {
  const path = looksPath(cwd);
  if (!existsSync(path)) return { bots: {}, humans: {} };
  try {
    return parseLooks(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return { bots: {}, humans: {} };
  }
}

export function saveLooks(cwd: string, file: LooksFile): LooksFile {
  const next = parseLooks(file);
  const path = looksPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function saveLook(
  cwd: string,
  input: { botId?: string; humanId?: string; skin?: string; hair?: string; top?: string },
): LooksFile {
  const file = loadLooks(cwd);
  const botId = String(input.botId ?? "").trim();
  const humanId = String(input.humanId ?? "").trim();
  const prev = botId ? file.bots[botId] : humanId ? file.humans[humanId] : undefined;
  const look = parseLook({
    skin: input.skin ?? prev?.skin,
    hair: input.hair ?? prev?.hair,
    top: input.top ?? prev?.top,
  });
  if (botId) file.bots[botId] = look;
  else if (humanId) file.humans[humanId] = look;
  return saveLooks(cwd, file);
}
