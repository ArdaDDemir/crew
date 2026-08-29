import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Provider } from "@crew/core";
import { FsWorkspace } from "@crew/workspace-fs";
import { defaultProviders, saveProviders } from "../../web/src/providers";
import { runCli } from "./run";

function ack(): Provider {
  return {
    async *complete() {
      yield { type: "text-delta", text: "ack" };
      yield { type: "done" };
    },
  };
}

async function cli(
  cwd: string,
  args: string[],
  extra?: {
    readLine?: () => Promise<string | null>;
    provider?: Provider;
    harnessRun?: import("@crew/provider-harness").HarnessRunner;
  },
) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(
    args,
    {
      cwd,
      writeOut: (s) => {
        stdout += s;
      },
      writeErr: (s) => {
        stderr += s;
      },
      readLine: extra?.readLine,
    },
    { provider: extra?.provider ?? ack(), harnessRun: extra?.harnessRun },
  );
  return { code, stdout, stderr };
}

function deskThenAccount(): Provider {
  let round = 0;
  return {
    async *complete() {
      round += 1;
      if (round === 1) {
        yield { type: "reasoning-delta", text: "secret plan" };
        yield { type: "text-delta", text: "checking files" };
        yield {
          type: "tool-call",
          id: "t1",
          name: "read",
          arguments: JSON.stringify({ path: "missing.txt" }),
        };
        yield { type: "done" };
        return;
      }
      yield { type: "text-delta", text: "bak missing.txt yoktu, sordum" };
      yield { type: "done" };
    },
  };
}

async function setupLanding(cwd: string) {
  await cli(cwd, ["bot", "create", "lead"]);
  await cli(cwd, ["bot", "create", "designer"]);
  await cli(cwd, ["bot", "create", "coder"]);
  await cli(cwd, [
    "channel",
    "create",
    "landing",
    "--bots",
    "lead,designer,coder",
    "--lead",
    "lead",
  ]);
}

test("bot create, channel create, say wakes mentioned bots and prints replies", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  const said = await cli(cwd, [
    "say",
    "landing",
    "@designer hero yaz @coder api kur",
  ]);
  expect(said.code).toBe(0);
  expect(said.stdout).toContain("woke: designer, coder");
  expect(said.stdout).toContain("designer: ack");
  expect(said.stdout).toContain("coder: ack");
  expect(said.stdout.indexOf("woke:")).toBeLessThan(said.stdout.indexOf("designer:"));
});

test("say announces unknown @ghost and still wakes coder", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  const said = await cli(cwd, ["say", "landing", "@ghost then @coder go"]);
  expect(said.code).toBe(0);
  expect(said.stdout).toContain("woke: coder");
  expect(said.stdout).toContain("Unknown @ghost is not a member of this channel.");
});

test("say prints held handoff for @ that will not wake", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  const said = await cli(cwd, ["say", "landing", "@designer hero yaz"], {
    provider: {
      async *complete() {
        yield { type: "text-delta", text: "hero done @coder put this in" };
        yield { type: "done" };
      },
    },
  });
  expect(said.code).toBe(0);
  expect(said.stdout).toContain("woke: designer");
  expect(said.stdout).toContain("@coder was mentioned and will wait for your next message.");
  expect(said.stdout).not.toMatch(/\ncoder:/);
});

test("say without mention wakes the lead", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  const said = await cli(cwd, ["say", "landing", "kick off"]);
  expect(said.code).toBe(0);
  expect(said.stdout).toContain("woke: lead");
  expect(said.stdout).toContain("lead: ack");
});

test("dm human to bot reports the other party woken", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await cli(cwd, ["bot", "create", "coder"]);
  const dm = await cli(cwd, ["dm", "human", "coder", "fix login"]);
  expect(dm.code).toBe(0);
  expect(dm.stdout).toContain("dm: human__coder");
  expect(dm.stdout).toContain("woke: coder");
  expect(dm.stdout).toContain("coder: ack");
});

test("dms lists threads and show reprints the private chat", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await cli(cwd, ["bot", "create", "coder"]);
  await cli(cwd, ["dm", "human", "coder", "fix login"]);
  const listed = await cli(cwd, ["dms"]);
  expect(listed.stdout).toContain("human__coder");
  const shown = await cli(cwd, ["dms", "show", "human", "coder"]);
  expect(shown.stdout).toContain("you:");
  expect(shown.stdout).toContain("fix login");
  expect(shown.stdout).toContain("@coder:");
});

test("mode changes the channel permission mode", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  const result = await cli(cwd, ["mode", "landing", "supervised"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("supervised");
});

test("mode sets a DM thread in dm-prefs.json", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  const dm = await cli(cwd, ["dm", "human", "coder", "hello there"]);
  expect(dm.code).toBe(0);
  const result = await cli(cwd, ["mode", "human__coder", "supervised"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("supervised");
  const prefs = JSON.parse(readFileSync(join(cwd, ".crew", "dm-prefs.json"), "utf8")) as {
    modes?: Record<string, string>;
  };
  expect(prefs.modes?.["human__coder"]).toBe("supervised");
});

test("open REPL posts lines until /quit", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  const lines = ["hello lead", "/quit"];
  const result = await cli(cwd, ["open", "landing"], {
    readLine: async () => lines.shift() ?? null,
  });
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("woke: lead");
});

test("config set model and key, show masks the key", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  const home = await mkdtemp(join(tmpdir(), "crew-home-"));
  let stdout = "";
  const io = {
    cwd,
    home,
    env: {},
    writeOut: (s: string) => {
      stdout += s;
    },
    writeErr: () => {},
  };
  expect(
    await runCli(
      ["config", "set", "model", "z-ai/glm-5.2:free"],
      io,
      { provider: ack() },
    ),
  ).toBe(0);
  expect(
    await runCli(
      ["config", "set", "key", "sk-or-abcdefghijklmnopqrstuvwxyz"],
      io,
      { provider: ack() },
    ),
  ).toBe(0);
  stdout = "";
  expect(await runCli(["config", "show"], io, { provider: ack() })).toBe(0);
  expect(stdout).toContain("z-ai/glm-5.2:free");
  expect(stdout).toContain("sk-o…wxyz");
  expect(stdout).not.toContain("abcdefghijklmnopqrstuvwxyz");
});

test("say prints provider errors to stderr", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  const boom: Provider = {
    async *complete() {
      yield { type: "error", message: "provider 429: rate-limited" };
      yield { type: "done" };
    },
  };
  let stdout = "";
  let stderr = "";
  const code = await runCli(
    ["say", "landing", "hello"],
    {
      cwd,
      writeOut: (s) => {
        stdout += s;
      },
      writeErr: (s) => {
        stderr += s;
      },
    },
    { provider: boom },
  );
  expect(code).toBe(0);
  expect(stdout).toContain("woke: lead");
  expect(stderr).toContain("lead ERROR:");
  expect(stderr).toContain("429");
});

test("log reprints channel chat", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  await cli(cwd, ["say", "landing", "hello lead"]);
  const log = await cli(cwd, ["log", "landing"]);
  expect(log.code).toBe(0);
  expect(log.stdout).toContain("you:");
  expect(log.stdout).toContain("@lead:");
});

test("say is chat-only; thinking and tools stay at the desk", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  const said = await cli(cwd, ["say", "landing", "hello lead"], {
    provider: deskThenAccount(),
  });
  expect(said.code).toBe(0);
  expect(said.stdout).toContain("lead: bak missing.txt yoktu, sordum");
  expect(said.stdout).not.toContain("checking files");
  expect(said.stdout).not.toContain("secret plan");
  expect(said.stdout).not.toContain("thinking");
  expect(said.stdout).not.toContain("[lead tool]");
});

test("--thinking and --verbose print desk work live", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  const said = await cli(
    cwd,
    ["say", "landing", "hello lead", "--thinking", "--verbose"],
    { provider: deskThenAccount() },
  );
  expect(said.code).toBe(0);
  expect(said.stdout).toContain("[lead thinking]");
  expect(said.stdout).toContain("secret plan");
  expect(said.stdout).toContain("[lead tool] read");
  expect(said.stdout).toContain("bak missing.txt yoktu, sordum");
});

test("log hides thinking and tools unless flagged", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  await cli(cwd, ["say", "landing", "hello lead"], {
    provider: deskThenAccount(),
  });
  const chat = await cli(cwd, ["log", "landing"]);
  expect(chat.stdout).toContain("@lead: bak missing.txt yoktu, sordum");
  expect(chat.stdout).not.toContain("secret plan");
  expect(chat.stdout).not.toContain("[lead tool]");

  const thoughts = await cli(cwd, ["log", "landing", "--thinking"]);
  expect(thoughts.stdout).toContain("secret plan");
  expect(thoughts.stdout).not.toContain("[lead tool]");

  const tools = await cli(cwd, ["log", "landing", "--verbose"]);
  expect(tools.stdout).toContain("[lead tool] read");
  expect(tools.stdout).not.toContain("secret plan");
});

test("bot update soul and skill copy round-trip", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await cli(cwd, ["bot", "create", "coder"]);
  await cli(cwd, ["bot", "create", "lead"]);
  const soul = join(cwd, "soul.md");
  writeFileSync(soul, "I write HTML.");
  const body = join(cwd, "skill.md");
  writeFileSync(body, "Use sections.");
  expect((await cli(cwd, ["bot", "update", "coder", "--soul", soul, "--name", "Frontend"])).code).toBe(0);
  const shown = await cli(cwd, ["bot", "show", "coder"]);
  expect(shown.stdout).toContain("name: Frontend");
  expect((await cli(cwd, ["skill", "add", "coder", "--name", "html", "--desc", "HTML", "--body", body])).code).toBe(0);
  expect((await cli(cwd, ["skill", "copy", "coder", "html", "lead"])).code).toBe(0);
  const listed = await cli(cwd, ["skill", "list"]);
  expect(listed.stdout).toContain("coder/html");
  expect(listed.stdout).toContain("lead/html");
  const skill = await cli(cwd, ["skill", "show", "lead", "html"]);
  expect(skill.stdout).toContain("Use sections.");
  expect(skill.stdout).toContain("name: html");
  expect((await cli(cwd, ["skill", "rm", "lead", "html"])).code).toBe(0);
  const after = await cli(cwd, ["skill", "show", "lead", "html"]);
  expect(after.code).toBe(1);
});

test("config set fallback and allowed", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  const home = await mkdtemp(join(tmpdir(), "crew-home-"));
  let stdout = "";
  const io = {
    cwd,
    home,
    env: {},
    writeOut: (s: string) => {
      stdout += s;
    },
    writeErr: () => {},
  };
  expect(await runCli(["config", "set", "fallback", "x-ai/grok-4"], io, { provider: ack() })).toBe(0);
  expect(await runCli(["config", "set", "allowed", "x-ai/grok-4,openai/gpt-4o"], io, { provider: ack() })).toBe(0);
  stdout = "";
  expect(await runCli(["config", "show"], io, { provider: ack() })).toBe(0);
  expect(stdout).toContain("x-ai/grok-4");
  expect(stdout).toContain("openai/gpt-4o");
});

test("say with no text exits 1", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  const result = await cli(cwd, ["say", "landing"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("usage:");
});

test("say unknown channel exits 1", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  const result = await cli(cwd, ["say", "nosuch", "hello"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("unknown channel");
});

test("dms show unknown thread exits 1 like say", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await cli(cwd, ["bot", "create", "coder"]);
  const result = await cli(cwd, ["dms", "show", "human", "coder"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("unknown dm");
});

test("unknown command exits 1", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  const result = await cli(cwd, ["nope"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("unknown command");
});

test("say with Grok harness spawns grok not OpenRouter", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  saveProviders(cwd, { ...defaultProviders(), grok: { enabled: true, binary: "grok" } });
  new FsWorkspace(join(cwd, ".crew")).updateBot("coder", { harness: "grok", harnessModel: "grok-4.6" });
  const argvLog: string[][] = [];
  const said = await cli(cwd, ["say", "landing", "@coder list files"], {
    provider: ack(),
    harnessRun: async function* (argv) {
      argvLog.push(argv);
      yield '{"type":"text","data":"from grok"}';
      return 0;
    },
  });
  expect(said.code).toBe(0);
  expect(said.stdout).toContain("from grok");
  expect(argvLog[0]?.includes("--prompt-file")).toBe(true);
});
