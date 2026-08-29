---
status: accepted
date: 2026-08-29
decision-makers: Arda
---

# Click-to-walk on the isometric floor

## Context and Problem Statement

`ADR-0056` seated people in a 2.5D room. The human asked to walk the office and to see AIs come to the table when they account. Walking must not be a wake. Clothes and furniture editing stay later.

## Decision Outcome

Qualifies `ADR-0056`. `packages/core` is unchanged. Mention routing is unchanged.

1. Click empty carpet (not a seat) moves **You** with a short CSS walk. Clamp to the room. Depth is `top`. This is not a `say` and not a DM.
2. A seat with pose `Writing` (channel account) walks to the glass table (`tableSlot`). Other poses stay at the PC (`deskSlot`). Nodes are reused so the transition runs. Click a seat is still `human__<id>` DM.
3. `prefers-reduced-motion` drops the walk transition.
4. Not this ADR: doors as channel switch, pathfinding around furniture, character clothes, furniture JSON.

### Confirmation

`apps/web` `walkYou` / `tableSlot`, CHANGELOG `[Unreleased]`.
