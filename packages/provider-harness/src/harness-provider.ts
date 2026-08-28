import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatEvent, ChatRequest, Provider } from "@crew/core";
import { buildHarnessArgv, type CrewPermissionMode, type HarnessKind } from "./argv";
import { isClaudeSuccessResult, parseHarnessLine } from "./parse";
import { flattenHarnessPrompt } from "./prompt";
import { spawnHarness, type HarnessRunner } from "./spawn";

export type HarnessCliOptions = {
  kind: HarnessKind;
  binary: string;
  cwd: string;
  signal?: AbortSignal;
  run?: HarnessRunner;
  writePrompt?: (text: string) => Promise<string>;
  unlinkPrompt?: (path: string) => Promise<void>;
  mode?: CrewPermissionMode;
  mcpConfigPath?: string;
};

export class HarnessCliProvider implements Provider {
  private readonly kind: HarnessKind;
  private readonly binary: string;
  private readonly cwd: string;
  private readonly signal?: AbortSignal;
  private readonly run: HarnessRunner;
  private readonly writePrompt: (text: string) => Promise<string>;
  private readonly unlinkPrompt: (path: string) => Promise<void>;
  private readonly mode: CrewPermissionMode;
  private readonly mcpConfigPath?: string;

  constructor(opts: HarnessCliOptions) {
    this.kind = opts.kind;
    this.binary = opts.binary;
    this.cwd = opts.cwd;
    this.signal = opts.signal;
    this.run = opts.run ?? spawnHarness;
    this.writePrompt = opts.writePrompt ?? writePromptFile;
    this.unlinkPrompt = opts.unlinkPrompt ?? unlinkPromptFile;
    this.mode = opts.mode ?? "auto-accept";
    this.mcpConfigPath = opts.mcpConfigPath;
  }

  async *complete(req: ChatRequest): AsyncIterable<ChatEvent> {
    const prompt = flattenHarnessPrompt(this.kind, req.messages);
    const promptFile = await this.writePrompt(prompt);
    let hadText = false;
    let hadError = false;
    try {
      const argv = buildHarnessArgv({
        kind: this.kind,
        binary: this.binary,
        cwd: this.cwd,
        promptFile,
        model: req.model,
        mode: this.mode,
        mcpConfigPath: this.mcpConfigPath,
      });
      const stream = this.run(argv, { cwd: this.cwd, signal: this.signal });
      for await (const line of stream) {
        const event = parseHarnessLine(this.kind, line);
        if (!event) continue;
        if (event.type === "text-delta" && this.kind === "claude" && hadText && isClaudeSuccessResult(line)) {
          continue;
        }
        if (event.type === "text-delta") hadText = true;
        if (event.type === "error") hadError = true;
        yield event;
      }
      const code = stream.exited ? await stream.exited : 0;
      if (!hadText && !hadError && code !== 0) {
        yield { type: "error", message: `${label(this.kind)} exited ${code}` };
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

function label(kind: HarnessKind): string {
  if (kind === "grok") return "Grok";
  if (kind === "claude") return "Claude";
  if (kind === "codex") return "Codex";
  return "OpenCode";
}

async function writePromptFile(text: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "crew-harness-"));
  const path = join(dir, "prompt.txt");
  await writeFile(path, text, "utf8");
  return path;
}

async function unlinkPromptFile(path: string): Promise<void> {
  await rm(join(path, ".."), { recursive: true, force: true });
}

export type { HarnessKind } from "./argv";
export { spawnHarness, onHarnessAbort, type HarnessRunner } from "./spawn";
export {
  DEFAULT_HARNESS_MODEL,
  HARNESS_KINDS,
  buildHarnessArgv,
  shouldSpawnHarness,
  type CrewPermissionMode,
} from "./argv";
export { parseHarnessLine } from "./parse";
export { flattenHarnessPrompt } from "./prompt";
