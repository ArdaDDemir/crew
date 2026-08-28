import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatEvent, ChatRequest, Provider } from "@crew/core";
import { parseGrokLine } from "./grok-ndjson";
import { buildGrokArgv, flattenGrokPrompt } from "./grok-prompt";

export type GrokRunOpts = { cwd: string; signal?: AbortSignal };

export type GrokRunner = (
  argv: string[],
  opts: GrokRunOpts,
) => AsyncIterable<string> & { exited?: Promise<number> };

export type GrokCliOptions = {
  binary: string;
  cwd: string;
  signal?: AbortSignal;
  run?: GrokRunner;
  writePrompt?: (text: string) => Promise<string>;
  unlinkPrompt?: (path: string) => Promise<void>;
};

export class GrokCliProvider implements Provider {
  private readonly binary: string;
  private readonly cwd: string;
  private readonly signal?: AbortSignal;
  private readonly run: GrokRunner;
  private readonly writePrompt: (text: string) => Promise<string>;
  private readonly unlinkPrompt: (path: string) => Promise<void>;

  constructor(opts: GrokCliOptions) {
    this.binary = opts.binary;
    this.cwd = opts.cwd;
    this.signal = opts.signal;
    this.run = opts.run ?? spawnGrok;
    this.writePrompt = opts.writePrompt ?? writePromptFile;
    this.unlinkPrompt = opts.unlinkPrompt ?? unlinkPromptFile;
  }

  async *complete(req: ChatRequest): AsyncIterable<ChatEvent> {
    const prompt = flattenGrokPrompt(req.messages);
    const promptFile = await this.writePrompt(prompt);
    let hadText = false;
    let hadError = false;
    try {
      const argv = buildGrokArgv({
        binary: this.binary,
        cwd: this.cwd,
        promptFile,
        model: req.model,
      });
      const stream = this.run(argv, { cwd: this.cwd, signal: this.signal });
      for await (const line of stream) {
        const event = parseGrokLine(line);
        if (!event) continue;
        if (event.type === "text-delta") hadText = true;
        if (event.type === "error") hadError = true;
        yield event;
      }
      const code = stream.exited ? await stream.exited : 0;
      if (!hadText && !hadError && code !== 0) {
        yield { type: "error", message: `Grok exited ${code}` };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!hadError) yield { type: "error", message };
    } finally {
      await this.unlinkPrompt(promptFile).catch(() => undefined);
    }
    yield { type: "done" };
  }
}

async function writePromptFile(text: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "crew-grok-"));
  const path = join(dir, "prompt.txt");
  await writeFile(path, text, "utf8");
  return path;
}

async function unlinkPromptFile(path: string): Promise<void> {
  await rm(join(path, ".."), { recursive: true, force: true });
}

export function spawnGrok(argv: string[], opts: GrokRunOpts): AsyncIterable<string> & { exited: Promise<number> } {
  const proc = Bun.spawn(argv, {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    signal: opts.signal,
  });
  const exited = proc.exited;
  async function* lines() {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split(/\r?\n/);
      buf = parts.pop() ?? "";
      for (const line of parts) {
        if (line.trim()) yield line;
      }
    }
    if (buf.trim()) yield buf;
  }
  const iter = lines();
  return {
    [Symbol.asyncIterator]: () => iter[Symbol.asyncIterator](),
    exited,
  };
}

export { parseGrokLine } from "./grok-ndjson";
export { buildGrokArgv, flattenGrokPrompt } from "./grok-prompt";
