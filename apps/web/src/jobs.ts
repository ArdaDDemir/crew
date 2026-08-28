import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  RESERVED_IDS,
  type ChatEvent,
  type CrewEvent,
  type Provider,
  type ThreadRef,
} from "@crew/core";

export const JOB_KEYS = ["title", "compact", "vision", "read"] as const;
export type JobKey = (typeof JOB_KEYS)[number];

export type JobSlot = {
  model: string;
  botId: string | null;
  harness: string | null;
  harnessModel: string | null;
};

export type Jobs = Record<JobKey, JobSlot>;

export type JobsHost = {
  cwd: string;
  model: string;
  provider: Provider;
  workspace: {
    getBot(id: string): { soul?: string; titleModel?: string; model?: string } | undefined;
  };
  store: {
    read(thread: ThreadRef): CrewEvent[];
    append(event: CrewEvent): void;
  };
};

const SKIP_KEYS = new Set<JobKey>(["vision", "read"]);

export const TITLE_PROMPT =
  'Title this chat. Return JSON only: {"title":"...","description":"..."} Title ≤ 48 chars. Description one line.';

export const VISION_PROMPT = "Caption this image in English, one or two sentences.";

export function defaultJobs(): Jobs {
  const slot = (): JobSlot => ({ model: "", botId: null, harness: null, harnessModel: null });
  return {
    title: slot(),
    compact: slot(),
    vision: slot(),
    read: slot(),
  };
}

export function jobsPath(host: JobsHost): string {
  return join(host.cwd, ".crew", "jobs.json");
}

function asSlot(raw: unknown): JobSlot {
  const slot: JobSlot = { model: "", botId: null, harness: null, harnessModel: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return slot;
  const row = raw as { model?: unknown; botId?: unknown; harness?: unknown; harnessModel?: unknown };
  if (typeof row.model === "string") slot.model = row.model.trim();
  if (typeof row.botId === "string" && row.botId.trim()) slot.botId = row.botId.trim();
  else slot.botId = null;
  if (typeof row.harness === "string" && row.harness.trim()) slot.harness = row.harness.trim();
  else slot.harness = null;
  if (typeof row.harnessModel === "string" && row.harnessModel.trim()) {
    slot.harnessModel = row.harnessModel.trim();
  } else slot.harnessModel = null;
  return slot;
}

export function loadJobs(host: JobsHost): Jobs {
  const path = jobsPath(host);
  const jobs = defaultJobs();
  if (!existsSync(path)) return jobs;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    for (const key of JOB_KEYS) jobs[key] = asSlot(parsed[key]);
  } catch {
    /* keep defaults */
  }
  return jobs;
}

export function saveJobs(host: JobsHost, jobs: Jobs): Jobs {
  const next = defaultJobs();
  for (const key of JOB_KEYS) next[key] = asSlot(jobs[key]);
  const path = jobsPath(host);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function resolveJobModel(host: JobsHost, key: JobKey, slot: JobSlot): string | null {
  if (key !== "title" && slot.botId) {
    const own = host.workspace.getBot(slot.botId)?.model?.trim();
    return own || host.model;
  }
  const model = slot.model.trim();
  if (model) return model;
  if (SKIP_KEYS.has(key)) return null;
  return host.model;
}

export function parseJobsBody(host: JobsHost, body: Record<string, unknown>): Jobs {
  const next = defaultJobs();
  for (const key of JOB_KEYS) {
    const row = body[key];
    if (row === undefined) continue;
    const slot = asSlot(row);
    if (slot.botId) {
      if (RESERVED_IDS.has(slot.botId)) throw new Error(`reserved id: ${slot.botId}`);
      if (!host.workspace.getBot(slot.botId)) throw new Error(`unknown bot: ${slot.botId}`);
    }
    next[key] = slot;
  }
  return next;
}

function eventText(event: ChatEvent): string {
  if (event.type === "text-delta") return event.text;
  const row = event as ChatEvent & { type: string; text?: string };
  if (row.type === "text" && typeof row.text === "string") return row.text;
  return "";
}

export async function runJob(
  host: JobsHost,
  job: JobSlot,
  prompt: string,
  opts?: { image?: string },
): Promise<string> {
  const model = job.model.trim() || host.model;
  const messages: { role: "system" | "user"; content: string }[] = [];
  if (job.botId) {
    const soul = host.workspace.getBot(job.botId)?.soul?.trim();
    if (soul) messages.push({ role: "system", content: soul });
  }
  let user = prompt;
  if (opts?.image) {
    user = `${prompt}\n\nImage path: ${opts.image}. Describe what a user would need to know.`;
  }
  messages.push({ role: "user", content: user });
  const stream = host.provider.complete({ model, messages, tools: [] });
  let text = "";
  for await (const event of stream) {
    if (event.type === "error") throw new Error(event.message);
    text += eventText(event);
  }
  return text.trim();
}

export function lastTitled(events: CrewEvent[]): CrewEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]!.type === "thread.titled") return events[i];
  }
  return undefined;
}

export function parseTitleJson(raw: string): { title: string; description: string } | null {
  const tryParse = (s: string) => {
    try {
      const obj = JSON.parse(s) as { title?: unknown; description?: unknown };
      if (obj && typeof obj === "object" && typeof obj.title === "string") {
        return {
          title: obj.title.replace(/\s+/g, " ").trim().slice(0, 48),
          description: String(obj.description ?? "")
            .replace(/\s+/g, " ")
            .trim(),
        };
      }
    } catch {
      /* not json */
    }
    return null;
  };
  const trimmed = raw.trim();
  const direct = tryParse(trimmed);
  if (direct) return direct;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    const inner = tryParse(fence[1].trim());
    if (inner) return inner;
  }
  const brace = trimmed.match(/\{[\s\S]*\}/);
  if (brace) return tryParse(brace[0]);
  return null;
}

function clock() {
  return {
    nextId: () => `evt_${crypto.randomUUID()}`,
    now: () => new Date().toISOString(),
  };
}

function firstHumanText(events: CrewEvent[]): string {
  const first = events.find((e) => {
    if (e.type !== "message.posted") return false;
    const author = e.payload.author as { kind?: string } | undefined;
    return author?.kind === "human";
  });
  return String(first?.payload.text ?? "").trim();
}

function fallbackTitle(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.slice(0, 48);
}

export async function titleThread(
  host: JobsHost,
  thread: ThreadRef,
  opts?: { force?: boolean; botId?: string },
): Promise<CrewEvent> {
  const events = host.store.read(thread);
  if (!opts?.force && lastTitled(events)) {
    return lastTitled(events)!;
  }
  const text = firstHumanText(events);
  if (!text) throw new Error("no human message");
  const jobs = loadJobs(host);
  const person = opts?.botId ? host.workspace.getBot(opts.botId) : undefined;
  const job: JobSlot = {
    model: (person?.titleModel || jobs.title.model || "").trim(),
    botId: opts?.botId ?? null,
  };
  const model = resolveJobModel(host, "title", job) ?? host.model;
  let title = fallbackTitle(text);
  let description = "";
  try {
    const raw = await runJob(host, job, `${TITLE_PROMPT}\n\n${text}`);
    const parsed = parseTitleJson(raw);
    if (parsed?.title) {
      title = parsed.title;
      description = parsed.description;
    }
  } catch {
    /* keep fallback */
  }
  const { nextId, now } = clock();
  const event: CrewEvent = {
    v: 1,
    id: nextId(),
    ts: now(),
    thread,
    type: "thread.titled",
    parent: null,
    payload: {
      title,
      description,
      model,
      botId: job.botId,
    },
  };
  host.store.append(event);
  return event;
}
