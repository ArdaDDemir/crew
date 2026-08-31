import { spawnSync } from "node:child_process";

export type HarnessReader = {
  getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> };
};

export type HarnessProc = {
  pid?: number;
  kill: () => void;
  stdout: HarnessReader;
  stderr?: HarnessReader;
  exited: Promise<number>;
};

export type HarnessSpawnFn = (
  argv: string[],
  opts: { cwd: string; stdout: "pipe"; stderr: "pipe"; stdin: "ignore" },
) => HarnessProc;

export type TreeKillFn = (pid: number) => void;

export type HarnessRunOpts = {
  cwd: string;
  signal?: AbortSignal;
  spawn?: HarnessSpawnFn;
  treeKill?: TreeKillFn;
};

export type HarnessRunner = (
  argv: string[],
  opts: HarnessRunOpts,
) => AsyncIterable<string> & { exited?: Promise<number>; stderrText?: Promise<string> };

export function onHarnessAbort(
  proc: { pid?: number; kill: () => void },
  treeKill: TreeKillFn,
): void {
  try {
    proc.kill();
  } catch {
    /* already dead */
  }
  if (typeof proc.pid === "number") {
    try {
      treeKill(proc.pid);
    } catch {
      /* ignore */
    }
  }
}

export function defaultTreeKill(pid: number): void {
  if (process.platform !== "win32") return;
  spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
}

export function spawnHarness(
  argv: string[],
  opts: HarnessRunOpts,
): AsyncIterable<string> & { exited: Promise<number>; stderrText: Promise<string> } {
  const spawn = opts.spawn ?? ((cmd, spawnOpts) => Bun.spawn(cmd, spawnOpts) as HarnessProc);
  const treeKill = opts.treeKill ?? defaultTreeKill;
  const proc = spawn(argv, {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const abort = () => onHarnessAbort(proc, treeKill);
  if (opts.signal) {
    if (opts.signal.aborted) abort();
    else opts.signal.addEventListener("abort", abort, { once: true });
  }
  const exited = proc.exited;
  const stderrText = drainStderr(proc);
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
    stderrText,
  };
}

async function drainStderr(proc: HarnessProc): Promise<string> {
  const stream = proc.stderr;
  if (!stream?.getReader) return "";
  try {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    return text;
  } catch {
    return "";
  }
}
