---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# Org tools grow the office; reserved ids stay human

## Context and Problem Statement

Bots needed to hire, open rooms, edit themselves, and pick up skills without the human using CLI. Slugs like `human` would collide with DM thread ids and `@` parsing.

## Decision Outcome

Channel tools (caps in `packages/core/src/org.ts`):

- `bot_create` — new member of this channel; not woken this `say`. Max 16 bots.
- `channel_create` — max 16 channels.
- `self_update` — own soul / orders / icon / name only.
- `skill_acquire` — copy if the skill exists anywhere; otherwise write `SKILL.md` only onto self.

Reserved bot ids: `human`, `you`, `everyone`, `engine`. `assertBotId` rejects them in workspace, CLI, and UI.

Delete (`removeBot` / `removeChannel`) does not rewrite JSONL (`ADR-0018`).

### Confirmation

`packages/core/src/org.ts`, `packages/core/src/slug.ts`.
