import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PermissionMode } from "@crew/core";

const MODES = new Set<PermissionMode>(["supervised", "auto-accept", "auto", "full-access"]);

export type DmPrefs = {
  archived: string[];
  deleted: string[];
  modes: Record<string, PermissionMode>;
};

export function dmPrefsPath(cwd: string): string {
  return join(cwd, ".crew", "dm-prefs.json");
}

export function defaultDmPrefs(): DmPrefs {
  return { archived: [], deleted: [], modes: {} };
}

function asIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function asModes(raw: unknown): Record<string, PermissionMode> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, PermissionMode> = {};
  for (const [id, mode] of Object.entries(raw as Record<string, unknown>)) {
    const tid = id.trim();
    if (!tid || !MODES.has(mode as PermissionMode)) continue;
    out[tid] = mode as PermissionMode;
  }
  return out;
}

export function parseDmPrefsBody(body: Record<string, unknown>): DmPrefs {
  return {
    archived: asIds(body.archived),
    deleted: asIds(body.deleted),
    modes: asModes(body.modes),
  };
}

export function loadDmPrefs(cwd: string): DmPrefs {
  const path = dmPrefsPath(cwd);
  if (!existsSync(path)) return defaultDmPrefs();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return parseDmPrefsBody(parsed);
  } catch {
    return defaultDmPrefs();
  }
}

export function saveDmPrefs(cwd: string, prefs: DmPrefs): DmPrefs {
  const next = parseDmPrefsBody(prefs as unknown as Record<string, unknown>);
  const path = dmPrefsPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function archiveDm(prefs: DmPrefs, id: string): DmPrefs {
  const tid = id.trim();
  if (!tid) return prefs;
  return {
    archived: prefs.archived.includes(tid) ? prefs.archived : [...prefs.archived, tid],
    deleted: prefs.deleted.filter((x) => x !== tid),
    modes: prefs.modes,
  };
}

export function unarchiveDm(prefs: DmPrefs, id: string): DmPrefs {
  const tid = id.trim();
  return {
    archived: prefs.archived.filter((x) => x !== tid),
    deleted: prefs.deleted,
    modes: prefs.modes,
  };
}

export function deleteDm(prefs: DmPrefs, id: string): DmPrefs {
  const tid = id.trim();
  if (!tid) return prefs;
  return {
    archived: prefs.archived.filter((x) => x !== tid),
    deleted: prefs.deleted.includes(tid) ? prefs.deleted : [...prefs.deleted, tid],
    modes: prefs.modes,
  };
}

export function setDmMode(prefs: DmPrefs, id: string, mode: PermissionMode): DmPrefs {
  const tid = id.trim();
  if (!tid || !MODES.has(mode)) return prefs;
  return { ...prefs, modes: { ...prefs.modes, [tid]: mode } };
}

export function ensureDmMode(prefs: DmPrefs, id: string, fallback: PermissionMode): DmPrefs {
  const tid = id.trim();
  if (!tid) return prefs;
  if (prefs.modes[tid]) return prefs;
  return setDmMode(prefs, tid, fallback);
}

export function dmModeOf(prefs: DmPrefs, id: string, fallback: PermissionMode = "auto-accept"): PermissionMode {
  return prefs.modes[id.trim()] ?? fallback;
}
