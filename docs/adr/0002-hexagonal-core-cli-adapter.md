---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# Hexagonal core; CLI is an adapter

## Context and Problem Statement

We need a Discord-like multi-bot system in the CLI first, then a GUI on the same engine. If the CLI owns the loop, the GUI is a rewrite.

## Considered Options

- Monolithic CLI (`console.log` inside the agent)
- Hexagonal core with ports; CLI / future UI are driving adapters
- Local HTTP server from day one (OpenCode)

## Decision Outcome

Chosen option: "Hexagonal core with in-process events", because v1 does not need HTTP, but it does need the same `Command` / `Event` types a GUI will later subscribe to.

`core` must not import CLI, HTTP, or Discord libraries.

### Consequences

- Good, because desktop/Discord later are new adapters
- Bad, because v1 has more types than a script would

### Confirmation

`packages/core` has no dependency on `apps/cli`. Tests drive core without a TTY.
