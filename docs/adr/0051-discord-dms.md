---
status: accepted
date: 2026-08-29
decision-makers: Arda
---

# Discord DMs are Crew DMs

## Context and Problem Statement

`ADR-0049` maps guild channels. A Discord DM to the receptionist is still dropped (no guild id). Two people still cannot talk privately with `@coder` from Discord. Bot-bot DMs stay in Crew; Discord cannot host them.

## Decision Outcome

Qualifies `ADR-0049`, `ADR-0047`, `ADR-0025`.

1. `.crew/discord.json` may set `dmBotId` (Crew slug). Missing `dmBotId`: Discord DMs stay ignored (fail-closed).
2. A Discord DM from a mapped human opens the Crew thread `human__<bot>` (owner) or `user__<humanId>__<bot>` (named). Extra convs unchanged.
3. The woken bot’s account is sent back as a Discord DM (REST), not a webhook username. Webhook/self loops still ignored.
4. Bot-bot DMs stay JSONL-only. Permission buttons, `0.0.0.0`, and live desktop mouse are still out.

### Confirmation

`apps/discord` map/bridge DM tests, CHANGELOG `[Unreleased]`.
