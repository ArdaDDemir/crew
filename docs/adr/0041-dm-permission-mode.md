---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# DM threads honor permission mode

## Context and Problem Statement

`docs/specs/permissions.md` says mode is stored on the channel **or DM**, and a new DM uses workspace `defaultPermissionMode`. The engine hardcoded DM turns to `auto-accept`. The office composer posted DMs as JSON (`POST /api/dm`) with `ask` always allow, so Shift+Tab / the mode chip did nothing on Direct. Edge case 57.

## Decision Drivers

- Do not add a JSONL event type (public session schema).
- Existing DMs without a stored mode stay `auto-accept`.
- Supervised DMs must be able to show the same Allow/Always/Deny card as channels.

## Decision Outcome

- Mode for a DM lives in `.crew/dm-prefs.json` `modes: { [threadId]: PermissionMode }` (`ADR-0033` file).
- **New** DM (`POST /api/dm/new` or first post on a missing thread) writes `defaultPermissionMode`.
- Legacy threads with no `modes` row stay `auto-accept` until the human sets a mode.
- `runBotTurn` accepts `permissionMode`; `dispatchDm` / channel-spawned DMs pass `permissionModeFor`.
- `POST /api/mode` `{ channelId, mode }` updates a DM when `channelId` is not a channel slug.
- Office DM send uses `POST /api/say` `{ kind: "dm", id, text }` (same NDJSON + ask cards as a channel). `POST /api/dm` JSON stays for scripts.

### Confirmation

`packages/core/src/turn.ts`, `apps/web/src/dm-prefs.ts`, `apps/web/src/host.ts` `sendDm` / `setMode`, CHANGELOG `[Unreleased]`.
