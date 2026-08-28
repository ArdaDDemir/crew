export type HarnessRunOpts = { cwd: string; signal?: AbortSignal };

export type HarnessRunner = (
  argv: string[],
  opts: HarnessRunOpts,
) => AsyncIterable<string> & { exited?: Promise<number> };

export function spawnHarness(
  argv: string[],
  opts: HarnessRunOpts,
): AsyncIterable<string> & { exited: Promise<number> } {
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
