---
status: accepted; auto-accept shell row superseded by ADR-0011
date: 2026-08-27
decision-makers: Arda
---

# Four permission modes (T3-shaped)

## Context and Problem Statement

Grok Bot comes back when it needs approval. T3 Code exposes this as selectable modes on the composer. We need both: bots have hands, the human chooses how much they may do unattended.

## Considered Options

- Always ask
- Always YOLO
- Four modes copied from T3 Code labels, mapped onto our tools

## Decision Outcome

Chosen option: "Four modes, per channel (and per DM), changeable mid-conversation". Default for new channels: **auto-accept**.

| Mode | File write in workspace | Shell / outside workspace |
|---|---|---|
| `supervised` | ask | ask |
| `auto-accept` | allow | ask |
| `auto` | secondary model may allow routine; risky → ask | same |
| `full-access` | allow | allow |

Always deny: `~/.ssh`, `.env`, `.env.*` (even in `full-access` until we add an explicit break-glass flag).

Approvals are events (`permission.asked` / `permission.resolved`), not `stdin` inside a tool. CLI, GUI, and tests inject the answer.

`auto` calls a reviewer model (same provider, cheaper model by default). v1 may implement it as “ask if the reviewer is unset”. Missing reviewer must not silently become `full-access`.

### Consequences

- Good, because the human picks the T3 control they already know
- Bad, because `auto` costs extra tokens

### Confirmation

`docs/specs/permissions.md`. Tests: auto-accept applies an in-workspace patch without asking; supervised does not.
