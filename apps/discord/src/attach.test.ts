import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachDiscord } from "./attach";
import type { DiscordInbound } from "./map";
import { createDiscordQueue } from "./queue";

test("attachDiscord noops without discord.json", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-discord-attach-"));
  const got = await attachDiscord({
    cwd,
    say: async () => ({ replies: [] }),
    botName: (id) => id,
  });
  expect(got).toEqual({ started: false, reason: "no discord.json" });
});

test("attachDiscord noops without token", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-discord-attach-"));
  mkdirSync(join(cwd, ".crew"), { recursive: true });
  writeFileSync(
    join(cwd, ".crew", "discord.json"),
    `${JSON.stringify({ guildId: "g1", channels: { "111": "landing" }, humans: { "222": "arda" } })}\n`,
  );
  const got = await attachDiscord({
    cwd,
    env: {},
    say: async () => ({ replies: [] }),
    botName: (id) => id,
  });
  expect(got.started).toBe(false);
  expect(got.reason).toMatch(/token/i);
});

test("attachDiscord connects when token and mapping exist", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-discord-attach-"));
  mkdirSync(join(cwd, ".crew"), { recursive: true });
  writeFileSync(
    join(cwd, ".crew", "discord.json"),
    `${JSON.stringify({
      guildId: "g1",
      tokenEnv: "DISCORD_BOT_TOKEN",
      channels: { "111": "landing" },
      humans: { "222": "arda" },
      webhooks: { landing: "https://discord.com/api/webhooks/1/tok" },
    })}\n`,
  );
  let connected = "";
  const got = await attachDiscord({
    cwd,
    env: { DISCORD_BOT_TOKEN: "secret" },
    say: async () => ({ replies: [] }),
    botName: (id) => id,
    connect: async ({ token }) => {
      connected = token;
    },
  });
  expect(got).toEqual({ started: true });
  expect(connected).toBe("secret");
});

test("attach webhook 429 retries without blocking the Crew say", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-discord-attach-"));
  mkdirSync(join(cwd, ".crew"), { recursive: true });
  writeFileSync(
    join(cwd, ".crew", "discord.json"),
    `${JSON.stringify({
      guildId: "g1",
      tokenEnv: "DISCORD_BOT_TOKEN",
      channels: { "111": "landing" },
      humans: { "222": "arda" },
      webhooks: { landing: "https://discord.com/api/webhooks/1/tok" },
    })}\n`,
  );
  const sleeps: number[] = [];
  const queue = createDiscordQueue({
    sleep: async (ms) => {
      sleeps.push(ms);
      await new Promise((r) => setTimeout(r, 40));
    },
  });
  let fetches = 0;
  const fetchFn = (async () => {
    fetches += 1;
    if (fetches === 1) {
      return new Response(JSON.stringify({ retry_after: 1 }), {
        status: 429,
        headers: { "Retry-After": "1" },
      });
    }
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  let onMessage: ((msg: DiscordInbound) => Promise<void>) | undefined;
  const got = await attachDiscord({
    cwd,
    env: { DISCORD_BOT_TOKEN: "secret" },
    say: async () => ({ replies: [{ botId: "coder", text: "hero" }] }),
    botName: (id) => (id === "coder" ? "Coder" : id),
    fetchFn,
    queue,
    connect: async ({ onMessage: om }) => {
      onMessage = om;
    },
  });
  expect(got).toEqual({ started: true });
  const t0 = Date.now();
  await onMessage!({
    guildId: "g1",
    channelId: "111",
    authorId: "222",
    content: "@coder hi",
  });
  expect(Date.now() - t0).toBeLessThan(30);
  await queue.idle();
  expect(fetches).toBe(2);
  expect(sleeps[0]).toBe(1000);
});

test("ask click uses the author of that Discord channel, not the last global message", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-discord-ask-"));
  mkdirSync(join(cwd, ".crew"), { recursive: true });
  writeFileSync(
    join(cwd, ".crew", "discord.json"),
    `${JSON.stringify({
      guildId: "g1",
      tokenEnv: "DISCORD_BOT_TOKEN",
      channels: { "111": "landing", "222": "ops" },
      humans: { aaa: "arda", bbb: "bera" },
      webhooks: {
        landing: "https://discord.com/api/webhooks/1/tok",
        ops: "https://discord.com/api/webhooks/2/tok",
      },
    })}\n`,
  );
  const bodies: string[] = [];
  const fetchFn = (async (_url: string, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ""));
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  let onMessage: ((msg: DiscordInbound) => Promise<void>) | undefined;
  let onInteraction:
    | ((row: {
        id: string;
        token: string;
        userId: string;
        customId: string;
        channelId: string;
      }) => Promise<void>)
    | undefined;
  const got = await attachDiscord({
    cwd,
    env: { DISCORD_BOT_TOKEN: "secret" },
    say: async () => ({ replies: [] }),
    botName: (id) => id,
    fetchFn,
    connect: async (input) => {
      onMessage = input.onMessage;
      onInteraction = input.onInteraction;
    },
  });
  expect(got).toEqual({ started: true });
  await onMessage!({
    guildId: "g1",
    channelId: "111",
    authorId: "aaa",
    content: "hi landing",
  });
  await onMessage!({
    guildId: "g1",
    channelId: "222",
    authorId: "bbb",
    content: "hi ops",
  });
  await onInteraction!({
    id: "i1",
    token: "t1",
    userId: "aaa",
    customId: "crew:allow",
    channelId: "111",
  });
  expect(bodies.some((b) => b.includes("Crew: allow"))).toBe(true);
  expect(bodies.some((b) => b.includes("Only the person who sent the message"))).toBe(false);
});
