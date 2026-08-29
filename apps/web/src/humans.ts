import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertSlug, OWNER_HUMAN_ID, RESERVED_IDS } from "@crew/core";

export const MAX_HUMANS = 16;

export type HumanRow = {
  id: string;
  handle: string;
  inviteHash: string;
};

export type HumansFile = {
  ownerId: string;
  humans: HumanRow[];
};

export type PublicHuman = {
  id: string;
  handle: string;
  invited: boolean;
};

export function defaultHumans(): HumansFile {
  return { ownerId: OWNER_HUMAN_ID, humans: [] };
}

export function humansPath(cwd: string): string {
  return join(cwd, ".crew", "humans.json");
}

export function hashInvite(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function parseHumansFile(raw: unknown): HumansFile {
  const out = defaultHumans();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const row = raw as { humans?: unknown };
  if (!Array.isArray(row.humans)) return out;
  const seen = new Set<string>();
  for (const item of row.humans) {
    if (!item || typeof item !== "object") continue;
    const h = item as { id?: unknown; handle?: unknown; inviteHash?: unknown };
    const id = String(h.id ?? "").trim();
    if (!id || seen.has(id) || RESERVED_IDS.has(id)) continue;
    try {
      assertSlug(id);
    } catch {
      continue;
    }
    seen.add(id);
    out.humans.push({
      id,
      handle: String(h.handle ?? id).trim() || id,
      inviteHash: String(h.inviteHash ?? "").trim(),
    });
    if (out.humans.length >= MAX_HUMANS) break;
  }
  return out;
}

export function loadHumans(cwd: string): HumansFile {
  const path = humansPath(cwd);
  if (!existsSync(path)) return defaultHumans();
  try {
    return parseHumansFile(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return defaultHumans();
  }
}

export function saveHumans(cwd: string, file: HumansFile): HumansFile {
  const next = parseHumansFile(file);
  const path = humansPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function inviteHuman(
  file: HumansFile,
  input: { id: string; handle?: string },
): { file: HumansFile; token: string } {
  const id = String(input.id ?? "").trim();
  assertSlug(id);
  if (RESERVED_IDS.has(id)) throw new Error(`reserved id: ${id}`);
  const existing = file.humans.some((h) => h.id === id);
  if (!existing && file.humans.length >= MAX_HUMANS) {
    throw new Error("max 16 humans");
  }
  const handle = String(input.handle ?? id).trim() || id;
  const token = randomBytes(24).toString("base64url");
  const inviteHash = hashInvite(token);
  const humans = file.humans.filter((h) => h.id !== id);
  humans.push({ id, handle, inviteHash });
  return { file: { ownerId: file.ownerId || OWNER_HUMAN_ID, humans }, token };
}

export function revokeInvite(file: HumansFile, id: string): HumansFile {
  const tid = String(id ?? "").trim();
  return {
    ownerId: file.ownerId || OWNER_HUMAN_ID,
    humans: file.humans.map((h) => (h.id === tid ? { ...h, inviteHash: "" } : h)),
  };
}

export function inviteTokenFrom(req: Request, body?: Record<string, unknown>): string {
  const header = String(req.headers.get("authorization") ?? "");
  const bearer = /^Bearer\s+(\S+)/i.exec(header);
  if (bearer?.[1]) return bearer[1];
  return String(body?.token ?? "").trim();
}

export type InviteActor = "owner" | "guest" | "invalid";

export function inviteActor(
  req: Request,
  body: Record<string, unknown> | undefined,
  file: HumansFile,
): InviteActor {
  const token = inviteTokenFrom(req, body);
  if (!token) return "owner";
  return humanForToken(file, token) ? "guest" : "invalid";
}

export function humanForToken(file: HumansFile, token: string): HumanRow | undefined {
  const raw = String(token ?? "").trim();
  if (!raw) return undefined;
  const hash = hashInvite(raw);
  return file.humans.find((h) => h.inviteHash && h.inviteHash === hash);
}

export function publicHumans(file: HumansFile): {
  ownerId: string;
  humans: PublicHuman[];
} {
  return {
    ownerId: file.ownerId || OWNER_HUMAN_ID,
    humans: file.humans.map((h) => ({
      id: h.id,
      handle: h.handle,
      invited: Boolean(h.inviteHash),
    })),
  };
}
