---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# Unknown `@` is announced, still not a wake

## Context and Problem Statement

Unknown `@ghost` is ignored for routing (`ADR-0005`). The human can think someone woke. Case 15. Held member `@` already gets `handoff.held` (`ADR-0045`). Discord / `crew serve` stay parked.

## Decision Outcome

After a human channel `say`, `@id` tokens that are not `everyone`, not reserved (`human`/`you`/`engine`), and not channel members, are recorded as `mention.ignored` (`ignored` + English `text`). Nobody is woken for those names. A bot who exists but is not in this channel is the same sentence: not a member.

CLI prints the line. Office shows it as a status line, like `handoff.held`.

Not this ADR: waking unknown names, Discord.

### Confirmation

`packages/core` dispatch, `apps/cli` say, `apps/web` readThread + `/api/say`, CHANGELOG `[Unreleased]`.
