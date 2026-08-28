---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# Office delete does not rewrite logs; Always is per-project

## Context and Problem Statement

The UI and CLI need to remove a bot or channel, and to remember “Always allow this tool fingerprint.” JSONL is append-only (`ADR-0004`). A second permission store must not live only in one adapter.

## Decision Drivers

- Logs stay after a person or room is gone.
- Always allow is the same rule in `crew open` and the web Allow/Deny card.
- Fingerprints must not dump full tool args (commands can be long).

## Considered Options

- Truncate or rewrite JSONL on delete.
- In-memory Always for the process only.
- Persist Always as `.crew/permissions.json` keyed by a small arg subset.

## Decision Outcome

Chosen option: disk delete of `.crew/bots/<id>` and `.crew/channels/<id>`; do **not** delete JSONL. Removing a bot drops that id from every channel `memberBotIds`. Empty channels are allowed (they wake nobody).

Always rules live in `.crew/permissions.json` as `{ tool, key }` where `key` is `fingerprint(tool, args)` over `path | command | name | id` only. CLI `defaultAsk` and web `sayChannel` both `loadAlways` / `rememberAlways`. A later matching ask is allowed with no prompt / no `type:"ask"` stream row.

### Consequences

- Good, because history of a deleted coworker is still in `crew log`.
- Good, because Always survives restart and is shared by CLI and UI.
- Bad, because a deleted bot’s DMs still appear until the human ignores them.
- Bad, because Always is per-project, not per-bot.

### Confirmation

`packages/core/src/always.ts`, `Workspace.removeBot` / `removeChannel`, `DELETE /api/bot/:id`, `DELETE /api/channel/:id`, `GET|DELETE /api/permissions`.
