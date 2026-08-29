---
status: accepted
date: 2026-08-29
decision-makers: Arda
---

# Channel desk is a 2.5D isometric floor

## Context and Problem Statement

The right rail is a Discord member list. The product sentence is an office: channels are rooms, bots sit at desks, they account at the table. A Habbo-like 2.5D view makes that visible. Walking, character clothes, and a furniture editor are later. Mention wake stays the scheduler.

## Decision Outcome

Qualifies `ADR-0020`. `packages/core` is unchanged.

1. The desk panel shows a **fixed isometric room** for the open channel: glass meeting bay (channel table), PC desks, a “You” chair. Members of this channel sit at desks. Non-members are absent.
2. Activity (`Thinking`, `Reading…`, `Writing`) is a pose on that seat (lamp/monitor, bob, bubble). Click a seat opens `human__<id>` DM, same as the member row.
3. Not this ADR: click-to-walk, doors as channel switch, office furniture JSON, character customization, Gather spatial audio.

### Confirmation

`apps/web` `#floor`, CHANGELOG `[Unreleased]`.
