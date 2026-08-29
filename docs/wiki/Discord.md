# Discord

Optional adapter. **Core has no Discord.** Real Discord is `apps/discord`.

## What it does

- Maps a guild channel ↔ a Crew channel (`.crew/discord.json`).
- Incoming messages become Crew `say` / DM. `<@id>` becomes `@humanId`.
- Crew accounts leave as webhook username (the person's name).
- Held `@` and unknown `@` post as `Crew`.
- Supervised / MCP / browser asks: Allow / Always / Deny buttons. Only the waking Discord user can click.
- A Crew `dm_send` to a mapped human also REST-DMs them on Discord.

Fail-closed: missing map or token → ignore. Token from `DISCORD_BOT_TOKEN` (or the env name in `discord.json`).

## Not this

Not a discord.js product. Not public `0.0.0.0`. Bot-bot DMs stay Crew JSONL-only. Always writes `.crew/permissions.json` when someone clicks Always.

See `docs/specs/discord.md` and ADR-0049–0053.
