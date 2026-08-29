---
status: accepted
date: 2026-08-29
decision-makers: Arda
---

# Floor looks: skin, hair, top

## Context and Problem Statement

`ADR-0059` let the owner furnish the room. Characters were still hashed-color dots. The human asked for their own character later; this ADR is that slice. Not a Habbo catalog. Mention routing is unchanged.

## Decision Outcome

Qualifies `ADR-0056`. `packages/core` is unchanged.

1. `.crew/looks.json` stores `{ bots, humans }` each `{ [id]: { skin, hair, top } }`. Skin: `light|mid|dark`. Hair: `short|ponytail|buzz|curly|none`. Top: `hoodie|tee|polo|sweater`.
2. `GET /api/looks`. `PUT /api/looks` `{ botId? , humanId?, skin?, hair?, top? }`. Owner may set a bot or any human (empty keys = owner `"human"`). Guest Bearer may only set **self**. Guest `botId` is 403.
3. The floor paints those looks. You pick Skin/Hair/Top under the room. Person sheet has the same three fields. Missing look keeps the hashed face colors.
4. Not this ADR: accessory slots, walk-cycle sprites, a clothing shop.

### Confirmation

`apps/web` looks.json + `#floor-look`, CHANGELOG `[Unreleased]`.
