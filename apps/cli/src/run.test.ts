import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Provider } from "@crew/core";
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
  extra?: { readLine?: () => Promise<string | null> },
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
    { provider: ack() },
  );
  return { code, stdout, stderr };
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

test("mode changes the channel permission mode", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  await setupLanding(cwd);
  const result = await cli(cwd, ["mode", "landing", "supervised"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("supervised");
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

test("unknown command exits 1", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-cli-"));
  const result = await cli(cwd, ["nope"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("unknown command");
});
