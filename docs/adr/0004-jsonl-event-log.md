---
status: accepted; compact event is `thread.compacted` (ADR-0019), not `session.compacted`
date: 2026-08-27
decision-makers: Arda
---

# Append-only JSONL event log

## Context and Problem Statement

Channels, DMs, tool calls, and approvals must be replayable. Aider-style markdown history is hostile to machines. A full event store is premature.

## Considered Options

- Markdown chat history
- Append-only versioned JSONL
- SQLite as the source of truth from day one

## Decision Outcome

Chosen option: "Append-only JSONL with `v: 1`", because it is event sourcing without a product. One file per channel, one file per DM. Compaction appends a `session.compacted` event; it does not rewrite history.

### Consequences

- Good, because tests and a future UI can tail the same log
- Bad, because listing thousands of sessions may later need a SQLite index (0.3+)

### Confirmation

`docs/specs/session-jsonl.md` is the contract. Readers must not assume unversioned fields.
