import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type DiscordConfig = {
  guildId: string;
  tokenEnv: string;
  channels: Record<string, string>;
  humans: Record<string, string>;
  botAuthors: string[];
  receptionistId: string;
  dmBotId: string;
  webhooks: Record<string, string>;
};

const SNOWFLAKE = /^\d+$/;
const SLUG = /^[a-z][a-z0-9-]*$/;

function asSnowflakeMap(raw: unknown, valueKind: "slug" | "human"): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!SNOWFLAKE.test(key)) continue;
    const id = String(value ?? "").trim();
    if (!SLUG.test(id)) continue;
    if (valueKind === "human" || valueKind === "slug") out[key] = id;
  }
  return out;
}

export function parseDiscordConfig(raw: unknown): DiscordConfig {
  const row = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const botAuthors = Array.isArray(row.botAuthors)
    ? row.botAuthors.map((id) => String(id ?? "").trim()).filter((id) => SNOWFLAKE.test(id))
    : [];
  const webhooks: Record<string, string> = {};
  if (row.webhooks && typeof row.webhooks === "object" && !Array.isArray(row.webhooks)) {
    for (const [key, value] of Object.entries(row.webhooks as Record<string, unknown>)) {
      if (!SLUG.test(key)) continue;
      const url = String(value ?? "").trim();
      if (!/^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\//i.test(url)) continue;
      webhooks[key] = url;
    }
  }
  return {
    guildId: String(row.guildId ?? "").trim(),
    tokenEnv: String(row.tokenEnv ?? "").trim() || "DISCORD_BOT_TOKEN",
    channels: asSnowflakeMap(row.channels, "slug"),
    humans: asSnowflakeMap(row.humans, "human"),
    botAuthors,
    receptionistId: String(row.receptionistId ?? "").trim(),
    dmBotId: SLUG.test(String(row.dmBotId ?? "").trim()) ? String(row.dmBotId).trim() : "",
    webhooks,
  };
}

export function snowflakeForHuman(cfg: DiscordConfig, humanId: string): string | undefined {
  const want = String(humanId ?? "").trim() || "human";
  for (const [snowflake, id] of Object.entries(cfg.humans)) {
    if (id === want) return snowflake;
  }
  return undefined;
}

export function discordPath(cwd: string): string {
  return join(cwd, ".crew", "discord.json");
}

export function loadDiscordConfig(cwd: string): DiscordConfig | null {
  const path = discordPath(cwd);
  if (!existsSync(path)) return null;
  try {
    const parsed = parseDiscordConfig(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.guildId) return null;
    return parsed;
  } catch {
    return null;
  }
}
