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
