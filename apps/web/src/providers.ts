import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const HARNESS_IDS = ["claude", "codex", "grok", "opencode"] as const;
export type HarnessId = (typeof HARNESS_IDS)[number];

export type HarnessSlot = {
  enabled: boolean;
  binary?: string;
  customModels?: string[];
};

export type ProvidersFile = {
  openrouter: { enabled: boolean };
  claude: HarnessSlot;
  codex: HarnessSlot;
  grok: HarnessSlot;
  opencode: HarnessSlot;
};

export type ProviderStatus = "ready" | "installed" | "missing" | "off";

export type ProviderCard = {
  id: "openrouter" | HarnessId;
  label: string;
  enabled: boolean;
  binary: string;
  status: ProviderStatus;
  installed: boolean;
  which: string | null;
  version: string | null;
  login: string | null;
};

const LABELS: Record<ProviderCard["id"], string> = {
  openrouter: "OpenRouter",
  claude: "Claude",
  codex: "Codex",
  grok: "Grok",
  opencode: "OpenCode",
};

const LOGIN: Record<HarnessId, string> = {
  claude: "claude auth login",
  codex: "codex login",
  grok: "grok login",
  opencode: "opencode auth login",
};

function asStatus(enabled: boolean, installed: boolean): ProviderStatus {
  if (!installed) return enabled ? "missing" : "off";
  return enabled ? "ready" : "installed";
}

export function providersPath(cwd: string): string {
  return join(cwd, ".crew", "providers.json");
}

export function defaultProviders(): ProvidersFile {
  const slot = (): HarnessSlot => ({ enabled: false, binary: "", customModels: [] });
  return {
    openrouter: { enabled: true },
    claude: slot(),
    codex: slot(),
    grok: slot(),
    opencode: slot(),
  };
}

function asCustomModels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const id = String(item ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function asSlot(raw: unknown): HarnessSlot {
  const slot: HarnessSlot = { enabled: false, binary: "", customModels: [] };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return slot;
  const row = raw as { enabled?: unknown; binary?: unknown; customModels?: unknown };
  slot.enabled = row.enabled === true;
  if (typeof row.binary === "string") slot.binary = row.binary.trim();
  slot.customModels = asCustomModels(row.customModels);
  return slot;
}

export function loadProviders(cwd: string): ProvidersFile {
  const path = providersPath(cwd);
  const next = defaultProviders();
  if (!existsSync(path)) return next;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (parsed.openrouter && typeof parsed.openrouter === "object") {
      next.openrouter.enabled = (parsed.openrouter as { enabled?: unknown }).enabled !== false;
    }
    for (const id of HARNESS_IDS) next[id] = asSlot(parsed[id]);
  } catch {
    /* keep defaults */
  }
  return next;
}

let modelsCache: { at: number; cwd: string; data: Record<string, { id: string; label: string }[]> } | null = null;

export function saveProviders(cwd: string, file: ProvidersFile): ProvidersFile {
  const next = defaultProviders();
  next.openrouter.enabled = file.openrouter?.enabled !== false;
  for (const id of HARNESS_IDS) next[id] = asSlot(file[id]);
  const path = providersPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  modelsCache = null;
  return next;
}

export function parseProvidersBody(body: Record<string, unknown>): ProvidersFile {
  const next = defaultProviders();
  if (body.openrouter && typeof body.openrouter === "object") {
    next.openrouter.enabled = (body.openrouter as { enabled?: unknown }).enabled !== false;
  }
  for (const id of HARNESS_IDS) {
    if (body[id] !== undefined) next[id] = asSlot(body[id]);
  }
  return next;
}

function extraBinDirs(): string[] {
  const home = process.env.USERPROFILE || process.env.HOME || homedir();
  const appdata = process.env.APPDATA ?? "";
  const local = process.env.LOCALAPPDATA ?? "";
  return [
    join(home, ".local", "bin"),
    join(home, ".claude", "local"),
    join(home, ".claude", "bin"),
    join(appdata, "npm"),
    join(local, "npm"),
    join(local, "Microsoft", "WinGet", "Links"),
    join(home, "scoop", "shims"),
  ];
}

function extraNames(id: string): string[] {
  if (process.platform === "win32") return [`${id}.exe`, `${id}.cmd`, `${id}.ps1`, id];
  return [id];
}

export function whichBinary(name: string): string | null {
  const id = name.trim();
  if (!id) return null;
  if (existsSync(id)) return id;
  try {
    const found = Bun.which(id);
    if (found) return found;
  } catch {
    /* fall through */
  }
  for (const dir of extraBinDirs()) {
    for (const n of extraNames(id)) {
      const p = join(dir, n);
      if (p && existsSync(p)) return p;
    }
  }
  return null;
}

function parseVersion(raw: string): string | null {
  const line = raw.replace(/\s+/g, " ").trim().split(/[\r\n]/)[0]?.trim() ?? "";
  if (!line) return null;
  const m = line.match(/v?\d+\.\d+(?:\.\d+)?/);
  return (m?.[0] || line).slice(0, 48);
}

async function runVersion(bin: string): Promise<string | null> {
  try {
    const proc = Bun.spawn([bin, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* gone */
      }
    }, 3000);
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    clearTimeout(timer);
    return parseVersion(out || err);
  } catch {
    return null;
  }
}

export async function probeHarness(
  id: HarnessId,
  binary?: string,
): Promise<{
  status: ProviderStatus;
  installed: boolean;
  which: string | null;
  version: string | null;
  login: string;
}> {
  const target = (binary || "").trim() || id;
  const found = whichBinary(target);
  const version = found ? await runVersion(found) : null;
  const installed = Boolean(found);
  return {
    status: asStatus(true, installed),
    installed,
    which: found,
    version,
    login: LOGIN[id],
  };
}

function cardFrom(
  id: HarnessId,
  slot: HarnessSlot,
  probe: { installed: boolean; which: string | null; version: string | null },
): ProviderCard {
  return {
    id,
    label: LABELS[id],
    enabled: slot.enabled,
    binary: slot.binary ?? "",
    status: asStatus(slot.enabled, probe.installed),
    installed: probe.installed,
    which: probe.which,
    version: probe.version,
    login: LOGIN[id],
  };
}

export function listProviderCards(cwd: string): ProviderCard[] {
  const file = loadProviders(cwd);
  const cards: ProviderCard[] = [
    {
      id: "openrouter",
      label: LABELS.openrouter,
      enabled: file.openrouter.enabled,
      binary: "",
      status: file.openrouter.enabled ? "ready" : "off",
      installed: true,
      which: null,
      version: null,
      login: null,
    },
  ];
  for (const id of HARNESS_IDS) {
    const slot = file[id];
    const found = whichBinary((slot.binary || "").trim() || id);
    cards.push(cardFrom(id, slot, { installed: Boolean(found), which: found, version: null }));
  }
  return cards;
}

export async function healthProviders(cwd: string): Promise<ProviderCard[]> {
  const file = loadProviders(cwd);
  const cards: ProviderCard[] = [
    {
      id: "openrouter",
      label: LABELS.openrouter,
      enabled: file.openrouter.enabled,
      binary: "",
      status: file.openrouter.enabled ? "ready" : "off",
      installed: true,
      which: null,
      version: null,
      login: null,
    },
  ];
  const harness = await Promise.all(
    HARNESS_IDS.map(async (id) => {
      const slot = file[id];
      const probe = await probeHarness(id, slot.binary);
      return cardFrom(id, slot, probe);
    }),
  );
  return [...cards, ...harness];
}

export type HarnessModel = { id: string; label: string };

const FALLBACK_MODELS: Record<HarnessId, HarnessModel[]> = {
  claude: [
    { id: "sonnet", label: "Sonnet" },
    { id: "opus", label: "Opus" },
    { id: "haiku", label: "Haiku" },
    { id: "fable", label: "Fable" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { id: "claude-fable-5", label: "Claude Fable 5" },
  ],
  codex: [
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
    { id: "gpt-5.5", label: "GPT-5.5" },
  ],
  grok: [
    { id: "grok-4.6", label: "grok-4.6" },
    { id: "grok-4.5", label: "grok-4.5" },
  ],
  opencode: [],
};

function uniqModels(rows: HarnessModel[]): HarnessModel[] {
  const seen = new Set<string>();
  const out: HarnessModel[] = [];
  for (const row of rows) {
    const id = row.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: (row.label || id).trim() });
  }
  return out;
}

export function parseHarnessModelList(id: HarnessId, text: string): HarnessModel[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (id === "grok") {
    const rows: HarnessModel[] = [];
    for (const line of lines) {
      const m = line.match(/^[*+\-]\s+(\S+)/);
      if (m?.[1]) rows.push({ id: m[1], label: m[1] });
    }
    return uniqModels(rows);
  }
  if (id === "opencode") {
    return uniqModels(
      lines
        .filter((l) => l.includes("/") && !l.startsWith("Usage") && !l.includes(" "))
        .map((l) => {
          const id = l.replace(/^\s+/, "");
          const short = id.split("/").pop() || id;
          return { id, label: short };
        }),
    );
  }
  if (id === "claude") {
    const rows: HarnessModel[] = [];
    for (const line of lines) {
      const aliases = line.match(/'([a-z0-9][\w.-]+)'/gi) || [];
      for (const a of aliases) {
        const slug = a.replace(/'/g, "");
        if (["sonnet", "opus", "haiku", "fable"].includes(slug) || slug.startsWith("claude-")) {
          rows.push({ id: slug, label: slug });
        }
      }
    }
    return uniqModels(rows);
  }
  if (id === "codex") {
    return parseCodexModelCache(text);
  }
  return [];
}

export function parseCodexModelCache(raw: string): HarnessModel[] {
  try {
    const parsed = JSON.parse(raw) as { models?: { slug?: string; id?: string; display_name?: string; visibility?: string; hidden?: boolean }[] };
    const models = Array.isArray(parsed.models) ? parsed.models : [];
    return uniqModels(
      models
        .filter((m) => m.visibility === "list" || (m.visibility !== "hide" && m.hidden !== true))
        .map((m) => {
          const id = String(m.slug || m.id || "").trim();
          return { id, label: String(m.display_name || id) };
        }),
    );
  } catch {
    return [];
  }
}

export function readCodexModelCache(home = homedir()): HarnessModel[] {
  const path = join(home, ".codex", "models_cache.json");
  if (!existsSync(path)) return [];
  try {
    return parseCodexModelCache(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

async function runText(bin: string, args: string[], ms = 6000): Promise<string> {
  const winCmd = process.platform === "win32" && /\.cmd$/i.test(bin);
  const cmd = winCmd ? "cmd.exe" : bin;
  const argv = winCmd ? ["/c", bin, ...args] : args;
  const proc = Bun.spawn([cmd, ...argv], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const timer = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* gone */
    }
  }, ms);
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  clearTimeout(timer);
  return `${out}\n${err}`;
}

export async function listHarnessModels(id: HarnessId, binary?: string): Promise<HarnessModel[]> {
  const found = whichBinary((binary || "").trim() || id);
  const fallback = FALLBACK_MODELS[id];
  if (!found) return fallback;
  try {
    if (id === "codex") {
      const cached = readCodexModelCache();
      if (cached.length) return uniqModels([...cached, ...fallback]);
    }
    const args =
      id === "grok" ? ["models"] : id === "opencode" ? ["models"] : id === "claude" ? ["--help"] : ["--help"];
    const text = await runText(found, args);
    const parsed = parseHarnessModelList(id, text);
    return parsed.length ? uniqModels([...parsed, ...fallback]) : fallback;
  } catch {
    return fallback;
  }
}

export async function listAllProviderModels(
  cwd: string,
  openrouter: string[],
): Promise<Record<string, HarnessModel[]>> {
  if (modelsCache && modelsCache.cwd === cwd && Date.now() - modelsCache.at < 60_000) {
    return modelsCache.data;
  }
  const file = loadProviders(cwd);
  const data: Record<string, HarnessModel[]> = {
    openrouter: openrouter.filter(Boolean).map((id) => ({ id, label: id })),
  };
  await Promise.all(
    HARNESS_IDS.map(async (id) => {
      const slot = file[id];
      const found = whichBinary((slot.binary || "").trim() || id);
      const custom = (slot.customModels ?? []).map((mid) => ({ id: mid, label: mid }));
      if (!found) {
        data[id] = custom;
        return;
      }
      data[id] = uniqModels([...custom, ...(await listHarnessModels(id, slot.binary))]);
    }),
  );
  modelsCache = { at: Date.now(), cwd, data };
  return data;
}

export function parseHarness(raw: unknown): HarnessId | null {
  if (raw === null || raw === "") return null;
  const id = String(raw ?? "").trim();
  if (!id) return null;
  if ((HARNESS_IDS as readonly string[]).includes(id)) return id as HarnessId;
  throw new Error(`unknown harness: ${id}`);
}
