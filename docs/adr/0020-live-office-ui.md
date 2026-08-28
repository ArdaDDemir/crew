---
status: accepted; sheet chrome → ADR-0023, attach/ids/buttons → ADR-0024
date: 2026-08-27
decision-makers: Arda
---

# Live office UI is the second adapter (watch + Discord-shaped desk)

## Context and Problem Statement

`ADR-0017` put a local Bun.serve UI on the same core. The office still felt dead: the rail showed a model id, Settings dumped the whole OpenRouter catalog, the right panel said “Not in the room”, and two processes writing JSONL did not refresh an open tab.

## Decision Outcome

`apps/web` stays an adapter. It never talks to OpenRouter.

- `GET /api/watch` is SSE of posted counts / membership. The idle UI refetches; a live `say` stream is not interrupted.
- Channel desk is a Discord member list: `Members — N`, status dots, a short activity line (`Reading index.html`). Non-members of this channel are omitted. No “Not in the room”.
- Settings catalog is search (2+ characters), compact rows, whitelist chips. The rail does not print the model id.
- New channel/person uses the full sheet: random locked slug, roster/rooms, rules, + File / + Folder paths, how-they-work mode.

### Confirmation

`apps/web/src/server.ts`, `docs/specs/web-ui.md`.
