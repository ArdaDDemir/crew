---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# If the human already named bots, this `say` does not hand off

## Context and Problem Statement

ADR-0013 stopped infinite re-wakes. One remaining leak: a bot that had **not** spoken yet still woke when `@`'d. Human said `@designer … @coder …`; coder wrote `@lead` `@tester`; lead and tester each took a paid turn to also say "need you for Devam."

Needing the human is a stop. The people the human named should work, account, and return the floor.

## Decision Outcome

- Human **named** member bots (or `@everyone`) → only those bots run this `say`. Their `@` is chat, not a wake.
- Human named **nobody** (lead fallback) → the lead may `@` workers **once**. Those workers' `@` does not start a third wave.

Need-human → stop. Next job is the next `say`.

### Confirmation

`dispatch.ts` (`humanPicked` / `allowHandoff`), `dispatch.test.ts`.
