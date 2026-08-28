---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# Held handoff is an engine pointer, not a wake

## Context and Problem Statement

`ADR-0014`: if the human already `@` named bots, a worker’s `@coder` is chat, not a wake. The job looks half-done: the account tags someone who never runs. Case 11 in `docs/specs/edge-cases.md`. Discord / `crew serve` stay parked.

## Decision Outcome

Qualifies `ADR-0014`. After the waves of a channel `say`, the engine scans account text for member `@id` who did **not** run this `say`. Those ids are recorded as `handoff.held` (JSONL, `waiting` + English `text`). Nobody is woken. The next job is the next human `say`.

CLI prints the line. Office `readThread` / say NDJSON show it as a status line (`engine`), not a person bubble.

Not this ADR: changing who wakes, Discord, auto-continuing the held bot.

### Confirmation

`packages/core` dispatch, `apps/cli` say, `apps/web` readThread + `/api/say`, CHANGELOG `[Unreleased]`.
