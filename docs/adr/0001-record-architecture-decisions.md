---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# Record architecture decisions

## Context and Problem Statement

The project will grow from a CLI to a desktop UI. Choices (runtime, permission model, session format) must stay recoverable.

## Considered Options

- No written decisions
- Nygard ADRs in `docs/adr/`
- Full RFC process (Rust/Swift style)

## Decision Outcome

Chosen option: "Nygard/MADR-lite in `docs/adr/`", because a solo/small team will actually write short files; an RFC bureaucracy will not be used.

### Consequences

- Good, because each irreversible choice has a number and a status
- Bad, because writing ADRs costs a few minutes per decision

### Confirmation

New architectural PRs include or update an ADR. Index lives in `docs/adr/README.md`.
