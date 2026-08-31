import { expect, test } from "bun:test";
import { spawnHarness } from "./spawn";

test("abort kills the process then tree-kills the pid", () => {
  const ac = new AbortController();
  const kills: string[] = [];
  spawnHarness(["grok"], {
    cwd: "/proj",
    signal: ac.signal,
    spawn: () => ({
      pid: 4242,
      kill() {
        kills.push("kill");
      },
      stdout: {
        getReader() {
          return {
            read: async () => ({ done: true as const, value: undefined }),
          };
        },
      },
      exited: Promise.resolve(1),
    }),
    treeKill: (pid) => {
      kills.push(`tree:${pid}`);
    },
  });
  ac.abort();
  expect(kills).toEqual(["kill", "tree:4242"]);
});

test("spawnHarness collects stderr while stdout streams", async () => {
  const enc = new TextEncoder();
  let sent = false;
  const stream = spawnHarness(["opencode"], {
    cwd: "/proj",
    spawn: () => ({
      pid: 7,
      kill() {},
      stdout: {
        getReader() {
          return {
            read: async () => {
              if (!sent) {
                sent = true;
                return { done: false as const, value: enc.encode('{"type":"step_start"}\n') };
              }
              return { done: true as const, value: undefined };
            },
          };
        },
      },
      stderr: {
        getReader() {
          let sentErr = false;
          return {
            read: async () => {
              if (!sentErr) {
                sentErr = true;
                return { done: false as const, value: enc.encode("boom\nno key\n") };
              }
              return { done: true as const, value: undefined };
            },
          };
        },
      },
      exited: Promise.resolve(0),
    }),
  });
  const lines: string[] = [];
  for await (const line of stream) lines.push(line);
  expect(lines).toEqual(['{"type":"step_start"}']);
  expect(await stream.stderrText).toBe("boom\nno key\n");
});

test("spawnHarness resolves stderrText even without stderr", async () => {
  const stream = spawnHarness(["grok"], {
    cwd: "/proj",
    spawn: () => ({
      pid: 8,
      kill() {},
      stdout: {
        getReader() {
          return { read: async () => ({ done: true as const, value: undefined }) };
        },
      },
      exited: Promise.resolve(0),
    }),
  });
  for await (const _line of stream) {
    /* nothing */
  }
  expect(await stream.stderrText).toBe("");
});
