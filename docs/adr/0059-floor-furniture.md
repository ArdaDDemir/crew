---
status: accepted
date: 2026-08-29
decision-makers: Arda
---

# Channel floor furniture is owner-editable

## Context and Problem Statement

`ADR-0056`–`0058` put a 2.5D room, walk, and doors on the desk. The human asked to customize the office (plants, sofas) without character clothes yet. JSONL is not the place for props.

## Decision Outcome

Qualifies `ADR-0056`. `packages/core` is unchanged.

1. `.crew/floor.json` stores `{ rooms: { [channelId]: [{ id, kind, x, y }] } }`. Kinds: `plant`, `lamp`, `sofa`, `shelf`, `rug`. Max 24 per channel. Missing file is empty rooms.
2. `GET /api/floor?id=` reads. `PUT /api/floor` `{ id, furniture }` writes. Unknown channel is 400. Guest Bearer is 403 (`ADR-0055`).
3. The owner sees a kit under the room. Pick a kind, click carpet to place. Click a placed piece to remove. Guests see furniture, not the kit. Walk still happens when no kind is held.
4. Not this ADR: character clothes, drag-move, a full Habbo catalog.

### Confirmation

`apps/web` floor.json + `#floor-kit`, CHANGELOG `[Unreleased]`.
