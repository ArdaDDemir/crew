import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type DmPrefs = {
  archived: string[];
  deleted: string[];
};

export function dmPrefsPath(cwd: string): string {
  return join(cwd, ".crew", "dm-prefs.json");
}

export function defaultDmPrefs(): DmPrefs {
  return { archived: [], deleted: [] };
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

export function parseDmPrefsBody(body: Record<string, unknown>): DmPrefs {
  return {
    archived: asIds(body.archived),
    deleted: asIds(body.deleted),
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
  };
}

export function unarchiveDm(prefs: DmPrefs, id: string): DmPrefs {
  const tid = id.trim();
  return {
    archived: prefs.archived.filter((x) => x !== tid),
    deleted: prefs.deleted,
  };
}

export function deleteDm(prefs: DmPrefs, id: string): DmPrefs {
  const tid = id.trim();
  if (!tid) return prefs;
  return {
    archived: prefs.archived.filter((x) => x !== tid),
    deleted: prefs.deleted.includes(tid) ? prefs.deleted : [...prefs.deleted, tid],
  };
}
