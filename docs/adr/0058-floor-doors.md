---
status: accepted
date: 2026-08-29
decision-makers: Arda
---

# Floor doors switch channel

## Context and Problem Statement

`ADR-0057` lets You walk the current room. Other channels still live only in the rail. The human asked to walk the office; a door on the back wall is the spatial way to change room. Walking onto a door is not required. Furniture editing stays later.

## Decision Outcome

Qualifies `ADR-0056`, `ADR-0057`. `packages/core` is unchanged. Mention routing is unchanged.

1. Other channels appear as **doors** on the back wall (`#floor-doors`). The open channel is the room you are in, not a door. Click a door calls `paneOpen(..., "channel", id)` — same as the rail. Not a wake.
2. Clicking a door does not move You as a walk target. Entering a room places You near the entrance.
3. No other channels → the door row is hidden.
4. Not this ADR: walk-into-door hitbox, furniture JSON, character clothes.

### Confirmation

`apps/web` `renderFloorDoors`, CHANGELOG `[Unreleased]`.
