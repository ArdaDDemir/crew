import { expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDiscordConfig, parseDiscordConfig, snowflakeForHuman } from "./config";

test("missing discord.json is null and is not written", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-discord-"));
  expect(loadDiscordConfig(cwd)).toBeNull();
  expect(existsSync(join(cwd, ".crew", "discord.json"))).toBe(false);
});

test("parseDiscordConfig keeps allowlists and drops junk", () => {
  const parsed = parseDiscordConfig({
    guildId: "g1",
    tokenEnv: "DISCORD_BOT_TOKEN",
    channels: { "111": "landing", "bad": "Nope", "": "x" },
    humans: { "222": "arda", "333": "human", "nope": "X" },
    botAuthors: ["444", ""],
    receptionistId: "bot9",
    dmBotId: "coder",
    webhooks: { landing: "https://discord.com/api/webhooks/1/tok" },
  });
  expect(parsed.guildId).toBe("g1");
  expect(parsed.tokenEnv).toBe("DISCORD_BOT_TOKEN");
  expect(parsed.channels).toEqual({ "111": "landing" });
  expect(parsed.humans).toEqual({ "222": "arda", "333": "human" });
  expect(parsed.botAuthors).toEqual(["444"]);
  expect(parsed.receptionistId).toBe("bot9");
  expect(parsed.dmBotId).toBe("coder");
  expect(parsed.webhooks.landing).toContain("webhooks/1/tok");
  expect(snowflakeForHuman(parsed, "arda")).toBe("222");
  expect(snowflakeForHuman(parsed, "human")).toBe("333");
  expect(snowflakeForHuman(parsed, "ghost")).toBeUndefined();
});

test("loadDiscordConfig reads .crew/discord.json not config.json", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "crew-discord-"));
  mkdirSync(join(cwd, ".crew"), { recursive: true });
  writeFileSync(
    join(cwd, ".crew", "discord.json"),
    `${JSON.stringify({ guildId: "g1", channels: { "111": "landing" }, humans: { "222": "arda" } })}\n`,
  );
  const loaded = loadDiscordConfig(cwd);
  expect(loaded?.guildId).toBe("g1");
  expect(loaded?.channels["111"]).toBe("landing");
  expect(existsSync(join(cwd, ".crew", "config.json"))).toBe(false);
});
