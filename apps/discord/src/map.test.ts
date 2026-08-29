import { expect, test } from "bun:test";
import { parseDiscordConfig } from "./config";
import { mapInbound } from "./map";

const cfg = parseDiscordConfig({
  guildId: "g1",
  channels: { "111": "landing" },
  humans: { "222": "arda", "333": "human" },
  botAuthors: ["444"],
  receptionistId: "bot9",
});

test("unmapped guild, channel, or author is ignored", () => {
  expect(
    mapInbound(cfg, {
      guildId: "other",
      channelId: "111",
      authorId: "222",
      content: "@coder go",
    }).ignore,
  ).toMatch(/guild/i);
  expect(
    mapInbound(cfg, {
      guildId: "g1",
      channelId: "999",
      authorId: "222",
      content: "@coder go",
    }).ignore,
  ).toMatch(/channel/i);
  expect(
    mapInbound(cfg, {
      guildId: "g1",
      channelId: "111",
      authorId: "nope",
      content: "@coder go",
    }).ignore,
  ).toMatch(/author/i);
});

test("webhook and receptionist messages are ignored", () => {
  expect(
    mapInbound(cfg, {
      guildId: "g1",
      channelId: "111",
      authorId: "222",
      webhookId: "wh",
      content: "I am Coder",
    }).ignore,
  ).toMatch(/webhook|loop/i);
  expect(
    mapInbound(cfg, {
      guildId: "g1",
      channelId: "111",
      authorId: "bot9",
      authorBot: true,
      content: "engine line",
    }).ignore,
  ).toMatch(/self|receptionist/i);
});

test("bot authors need the allowlist and a humans map", () => {
  expect(
    mapInbound(cfg, {
      guildId: "g1",
      channelId: "111",
      authorId: "555",
      authorBot: true,
      content: "@coder go",
    }).ignore,
  ).toMatch(/bot/i);
  expect(
    mapInbound(cfg, {
      guildId: "g1",
      channelId: "111",
      authorId: "444",
      authorBot: true,
      content: "@coder go",
    }).ignore,
  ).toMatch(/author/i);
});

test("Discord DM from a mapped human uses dmBotId", () => {
  const withDm = parseDiscordConfig({
    guildId: "g1",
    channels: { "111": "landing" },
    humans: { "222": "arda" },
    dmBotId: "coder",
  });
  const got = mapInbound(withDm, {
    channelId: "dmchan",
    authorId: "222",
    content: "fix login",
  });
  expect(got.ignore).toBeUndefined();
  expect(got.kind).toBe("dm");
  expect(got.botId).toBe("coder");
  expect(got.humanId).toBe("arda");
  expect(got.text).toBe("fix login");
  expect(
    mapInbound(cfg, {
      channelId: "dmchan",
      authorId: "222",
      content: "fix login",
    }).ignore,
  ).toMatch(/dm/i);
});

test("mapped human rewrites Discord mentions and keeps @coder", () => {
  const got = mapInbound(cfg, {
    guildId: "g1",
    channelId: "111",
    authorId: "222",
    content: "<@333> see <@!222> then @coder go",
  });
  expect(got.ignore).toBeUndefined();
  expect(got.crewChannelId).toBe("landing");
  expect(got.humanId).toBe("arda");
  expect(got.text).toBe("@human see @arda then @coder go");
});
