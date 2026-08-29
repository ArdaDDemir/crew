---
status: accepted
date: 2026-08-29
decision-makers: Arda
---

# Crew `dm_send` to a mapped human also DMs Discord

## Context and Problem Statement

`ADR-0051` maps Discord DMs into Crew and replies on that thread. A channel turn that `dm_send`s `to: "human"` still stays only in Crew JSONL. The Discord user never sees it.

## Decision Outcome

Qualifies `ADR-0051`, `ADR-0015`.

1. After a successful `dm_send` to the waking human, the engine may call `onHumanDm({ humanId, text, threadId })`. Core stays I/O-free.
2. The Discord adapter reverse-maps `humanId` → Discord snowflake from `.crew/discord.json` `humans` and REST-DMs that user. Unmapped humans: no Discord send (Crew JSONL still holds the DM).
3. Bot-bot `dm_send` is unchanged. `0.0.0.0` and live desktop mouse stay out.

### Confirmation

`packages/core` dispatch `onHumanDm`, `apps/discord` reverse map, CHANGELOG `[Unreleased]`.
