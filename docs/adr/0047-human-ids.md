---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# Humans have ids; owner is `human`

## Context and Problem Statement

Every person is `{ kind: "human" }`. Two browsers or two Discord users become one brain: `ADR-0016` latest-human-wins is global. DMs are `human__coder`. `crew serve` and a Discord adapter both need distinct people. Discord.js, Playwright, and public bind are **not** this ADR.

## Decision Outcome

Qualifies `ADR-0016`, `ADR-0015`, `ADR-0025`.

1. Human authors may carry `humanId` (slug). Missing `humanId` is the **owner** id `"human"` (loopback operator).
2. Owner DMs stay `human__<bot>` (and `human__<bot>__<conv>`). Other humans: `user__<humanId>__<bot>` (extra conv after that). `user` is a reserved bot id.
3. Latest-human-wins is per `(botId, humanId)`: the waking human’s own channel + human↔bot DMs. Other humans’ DMs are unread pointers, not the winning order.
4. `.crew/humans.json`: `{ ownerId: "human", humans: [{ id, handle, inviteHash }] }`. Invite raw token is shown once; store SHA-256 hex. Revoke clears the hash. Loopback `say` still needs no token and posts as owner.
5. Not this ADR: `0.0.0.0`, Discord Gateway, computer-use, rewriting JSONL lines (legacy posts stay owner).

### Confirmation

`packages/core` events/orders/post/dispatch, `apps/web` humans.json, CHANGELOG `[Unreleased]`.
