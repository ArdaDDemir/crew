# Discord adapter

`apps/discord` (`ADR-0049`). Same `packages/core`. JSONL is source of truth. Discord is a view.

## Config

`.crew/discord.json`:

```json
{
  "guildId": "123",
  "tokenEnv": "DISCORD_BOT_TOKEN",
  "channels": { "111": "landing" },
  "humans": { "222": "arda", "333": "human" },
  "botAuthors": ["444"],
  "receptionistId": "555",
  "dmBotId": "coder",
  "webhooks": { "landing": "https://discord.com/api/webhooks/ID/TOKEN" }
}
```

Fail-closed: unknown guild, channel, or author is ignored. Webhook and receptionist messages are ignored (no loop). Missing file: office runs without Discord.

Token: env named by `tokenEnv` (default `DISCORD_BOT_TOKEN`). `crew serve` / `bun run ui` attach when the file and token exist. Stdout: `crew discord  attached`.

## In / out

- In: Discord text. `<@id>` → `@humanId` when mapped. Crew `@coder` still wakes via `parseMentions`.
- Out: each Crew account is a webhook execute, `username` = person name. `handoff.held` and `mention.ignored` use username `Crew`. Outbound is queued per destination (webhook URL, bot channel, user DM). HTTP 429 honors JSON `retry_after` seconds, then `Retry-After`, then `X-RateLimit-Reset-After`. Enqueue does not block Crew JSONL or wake (`ADR-0054`). Still 429 after eight attempts: stderr `discord outbound dropped after rate limits:` (`ADR-0055`).
- DMs (`ADR-0051`): Discord DM from a mapped human → Crew `human__<dmBotId>` or `user__<id>__<dmBotId>`. Bot reply goes back as a Discord DM (REST). No `dmBotId`: DMs ignored. Bot-bot DMs stay in Crew JSONL.
- Channel `dm_send` to human (`ADR-0053`): also REST-DMs the mapped Discord user. Unmapped humans stay Crew-only.
- Ask (`ADR-0052`): supervised / MCP / browser waits post Allow / Always / Deny in that Discord channel or DM. Only the waking user may click. Always uses existing Always rules.
- Not v1: Discord-side handoff (`ADR-0014`).
