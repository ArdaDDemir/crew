export type UpdateManifest = {
  version: string;
  notes: string;
  url: string;
};

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

export function parseUpdateManifest(raw: unknown): UpdateManifest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
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
        if (/^https?:\/\//i.test(next)) {
          url = next;
          break;
        }
      }
    }
  }
  if (!/^https?:\/\//i.test(url)) return null;
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
    const parsed = parseUpdateManifest(await res.json());
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
