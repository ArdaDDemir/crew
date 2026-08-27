---
status: accepted; in-say handoff qualified by ADR-0014
date: 2026-08-27
decision-makers: Arda
---

# One turn per bot per `say`; human is the stop

## Context and Problem Statement

Mention = wake. Bots `@` each other in accounts to CC, thank, or say "waiting on you." Dispatch then fan-out those mentions for up to 16 waves. One human line (`@designer … @coder …`) became dozens of paid turns saying the same "Devam dersen" until the process was killed.

Coworkers stop when they need the human. The engine must enforce that. Prompting "don't @ to CC" is not enough.

## Decision Drivers

- Channel is a standup, not an infinite meeting.
- A real handoff still works: someone who has **not** spoken this `say` can be `@`'d once.
- Needing the human (approval, missing spec) is a **stop**, not a new wake wave.

## Considered Options

- Prompt-only ("do not @ to CC")
- Cap waves at 2
- One turn per bot per `say`; skip already-spoken on fan-out

## Decision Outcome

Chosen option: "One turn per bot per `say`".

- Human post wakes mentioned bots (or the lead).
- Each of those bots may `@` others who have **not** already taken a turn this dispatch.
- A bot that already accounted is not woken again, even if `@`'d.
- If the job needs the human, bots write to the human with no `@` and stop.

### Consequences

- Good, because courtesy `@lead @coder @tester` cannot restart the meeting
- Good, because `@designer hero` then designer `@coder koy` still wakes coder once
- Bad, because if designer and coder were both in the first wave, designer cannot wake coder **again** in the same `say` with new copy. The human posts once more. That matches "need a person → stop."

### Confirmation

`packages/core/src/dispatch.ts`, `dispatch.test.ts` (already-spoken not re-woken), `prompt.ts`.
