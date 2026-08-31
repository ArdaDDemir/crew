import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type UpdateManifest = {
  version: string;
  notes: string;
  url: string;
};

export const DEFAULT_UPDATE_FEED = "https://api.github.com/repos/ArdaDDemir/crew/releases/latest";

export function effectiveUpdateFeed(
  autoUpdate: boolean | undefined,
  updateUrl: string | undefined,
): string {
  const url = asUpdateUrl(updateUrl);
  if (url) return url;
  return autoUpdate === false ? "" : DEFAULT_UPDATE_FEED;
}

export type UpdateCheck =
  | { status: "disabled" }
  | { status: "current"; version: string }
  | { status: "available"; version: string; notes: string; url: string }
  | { status: "error"; error: string };

export function parseCrewVersion(raw: string): [number, number, number] | null {
  const m = String(raw ?? "")
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function cmpCrewVersion(a: string, b: string): number {
  const aa = parseCrewVersion(a);
  const bb = parseCrewVersion(b);
  if (!aa || !bb) return 0;
  for (let i = 0; i < 3; i++) {
    if (aa[i] !== bb[i]) return aa[i]! < bb[i]! ? -1 : 1;
  }
  return 0;
}

export function asUpdateUrl(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol === "https:") return u.toString();
    if (u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) {
      return u.toString();
    }
    return "";
  } catch {
    return "";
  }
}

function resolveDownloadUrl(raw: string, source?: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return asUpdateUrl(s);
  if (!source) return "";
  try {
    return asUpdateUrl(new URL(s, source).toString());
  } catch {
    return "";
  }
}

export function parseUpdateManifest(raw: unknown, source?: string): UpdateManifest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const gh = raw as { tag_name?: unknown; body?: unknown; assets?: unknown };
  if (typeof gh.tag_name === "string") {
    const version = gh.tag_name.trim().replace(/^v/i, "");
    if (!parseCrewVersion(version)) return null;
    const rows = (Array.isArray(gh.assets) ? gh.assets : [])
      .map((a) => {
        const row = a as { name?: unknown; browser_download_url?: unknown } | null;
        return { name: String(row?.name ?? ""), url: String(row?.browser_download_url ?? "").trim() };
      })
      .filter((a) => a.url && /^https?:\/\//i.test(a.url));
    const pick = (re: RegExp) => rows.find((a) => re.test(a.name));
    const chosen = pick(/-setup\.exe$/i) ?? pick(/\.msi$/i) ?? pick(/portable\.zip$/i) ?? rows[0];
    if (!chosen) return null;
    return { version, notes: String(gh.body ?? "").trim(), url: chosen.url };
  }
  const row = raw as { version?: unknown; notes?: unknown; url?: unknown; platforms?: unknown };
  const version = String(row.version ?? "").trim();
  if (!parseCrewVersion(version)) return null;
  let url = String(row.url ?? "").trim();
  if (!url && row.platforms && typeof row.platforms === "object" && !Array.isArray(row.platforms)) {
    const plats = row.platforms as Record<string, { url?: unknown } | undefined>;
    url = String(plats["windows-x86_64"]?.url ?? "").trim();
    if (!url) {
      for (const p of Object.values(plats)) {
        const next = String(p?.url ?? "").trim();
        if (next) {
          url = next;
          break;
        }
      }
    }
  }
  url = resolveDownloadUrl(url, source);
  if (!url) return null;
  return { version, notes: String(row.notes ?? "").trim(), url };
}

export async function checkCrewUpdate(input: {
  current: string;
  updateUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<UpdateCheck> {
  const url = asUpdateUrl(input.updateUrl);
  if (!url) return { status: "disabled" };
  const fetchImpl = input.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs ?? 8000);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return { status: "error", error: `update check ${res.status}` };
    const parsed = parseUpdateManifest(await res.json(), url);
    if (!parsed) return { status: "error", error: "invalid update manifest" };
    if (cmpCrewVersion(input.current, parsed.version) >= 0) {
      return { status: "current", version: parsed.version };
    }
    return { status: "available", version: parsed.version, notes: parsed.notes, url: parsed.url };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export type ReleaseManifestInput = {
  version: string;
  notes: string;
  msi?: string;
  nsis?: string;
  baseUrl?: string;
};

function fileUrl(name: string, baseUrl?: string): string {
  const file = name.replace(/\\/g, "/").split("/").pop() || name;
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) return file;
  return `${base}/${file}`;
}

export function buildReleaseManifest(input: ReleaseManifestInput): {
  version: string;
  notes: string;
  url: string;
  platforms: Record<string, { url: string }>;
} {
  const msi = String(input.msi ?? "").trim();
  const nsis = String(input.nsis ?? "").trim();
  const url = fileUrl(msi || nsis, input.baseUrl);
  const platforms: Record<string, { url: string }> = {};
  if (msi) platforms["windows-x86_64"] = { url: fileUrl(msi, input.baseUrl) };
  if (nsis) platforms["windows-x86_64-nsis"] = { url: fileUrl(nsis, input.baseUrl) };
  return { version: input.version, notes: input.notes, url, platforms };
}

export function changelogNotesForVersion(md: string, version: string): string {
  const esc = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = md.match(new RegExp(`## \\[${esc}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`));
  if (!m) return "";
  const bullets = m[1]
    .split(/\r?\n/)
    .map((line) => line.match(/^[-*]\s+(.+)$/)?.[1] ?? "")
    .map((text) => text.replace(/\*\*/g, "").replace(/`/g, "").trim())
    .filter(Boolean);
  return bullets.slice(0, 8).join("\n");
}

export function writeReleaseManifest(dir: string, input: ReleaseManifestInput): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "latest.json");
  writeFileSync(path, `${JSON.stringify(buildReleaseManifest(input), null, 2)}\n`, "utf8");
  return path;
}

export type UpdaterManifestInput = {
  version: string;
  notes: string;
  signature: string;
  url?: string;
  repo?: string;
  now?: () => string;
};

export function buildUpdaterManifest(input: UpdaterManifestInput): {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
} {
  const version = input.version.trim();
  const url =
    input.url?.trim() ||
    `https://github.com/${(input.repo || "ArdaDDemir/crew").trim()}/releases/download/v${version}/Crew_${version}_x64-setup.exe`;
  return {
    version,
    notes: input.notes,
    pub_date: input.now ? input.now() : new Date().toUTCString(),
    platforms: { "windows-x86_64": { signature: input.signature, url } },
  };
}

export function writeUpdaterManifest(
  dir: string,
  input: UpdaterManifestInput,
): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "latest.json");
  writeFileSync(path, `${JSON.stringify(buildUpdaterManifest(input), null, 2)}\n`, "utf8");
  return path;
}
