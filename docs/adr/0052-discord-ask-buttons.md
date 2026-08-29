---
status: accepted
date: 2026-08-29
decision-makers: Arda
---

# Discord ask is Allow / Deny / Always buttons

## Context and Problem Statement

Supervised and `mcp_*` / `browser_*` asks wait on `host.run.resolveAsk`. The office UI shows cards. A Discord-originated `say` with `live: true` waits with no Discord control, so the turn hangs. `ADR-0049` parked permission buttons.

## Decision Outcome

Qualifies `ADR-0049`, `ADR-0018`.

1. When Crew asks during a Discord-originated turn, the receptionist posts a message in that Discord channel or DM with three buttons: **Allow**, **Always**, **Deny** (`custom_id` `crew:allow` / `crew:always` / `crew:deny`).
2. Only the Discord user who sent the waking message may click. Others are ignored. Always writes `.crew/permissions.json` via existing `resolveAsk`.
3. Button clicks are Gateway `INTERACTION_CREATE`, not webhook. The ask message is then updated to a one-line result.
4. Not this ADR: `0.0.0.0`, live desktop mouse, Discord-side handoff.

### Confirmation

`apps/discord` ask tests, CHANGELOG `[Unreleased]`.
