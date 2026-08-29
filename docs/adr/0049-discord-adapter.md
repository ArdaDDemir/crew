---
status: accepted
date: 2026-08-29
decision-makers: Arda
---

# Discord is an adapter

## Context and Problem Statement

Crew already has channels, `@` wake, and `humanId` (`ADR-0047`). A Discord guild should be a **view**, not a second office. One Discord bot user cannot be 16 Crew people. Discord-side auto-handoff would violate `ADR-0014`. `packages/core` must stay Discord-free.

## Decision Outcome

Qualifies `ADR-0002`, `ADR-0005`, `ADR-0014`, `ADR-0047`.

1. `apps/discord` is the adapter. Core has zero Discord imports. JSONL stays source of truth.
2. One Gateway receptionist. Map guild+channel → Crew channel, Discord user id → `humanId`. Fail-closed: unknown guild, channel, or author is ignored.
3. Incoming text keeps Crew `parseMentions`. Discord `<@id>` becomes `@<humanId>` when mapped.
4. Crew accounts leave via **one webhook per mapped channel**, `username` = that person’s name. Receptionist Gateway-replies only for engine lines (`handoff.held`, `mention.ignored`). Webhook/self messages are ignored (no loop).
5. Mapping: `.crew/discord.json`. Token from env (`tokenEnv`, default `DISCORD_BOT_TOKEN`). Allowlisted `botAuthors` may post; they still need a humans map.
6. Not this ADR: Discord DMs, permission buttons, 16 Discord apps, Discord-side handoff, `0.0.0.0`, Playwright.

### Confirmation

`apps/discord` map/bridge tests, `.crew/discord.json`, CHANGELOG `[Unreleased]`.
