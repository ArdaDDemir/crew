---
status: accepted; qualified by 0028
date: 2026-08-27
decision-makers: Arda
---

# Prompt history is a window; compact appends, never rewrites

## Context and Problem Statement

`buildHistory` sent every `message.posted` in the thread. Landing logs grow; models stay expensive and treat cancelled jobs as live. JSONL must stay append-only (`ADR-0004`).

## Decision Drivers

- Do not rewrite JSONL.
- The human UI still shows the full thread.
- The model must not assume omitted history is still the job.

## Considered Options

- LLM summary rewrite of the log file
- Sliding window in the prompt only, no event
- Append `thread.compacted` + window the prompt

## Decision Outcome

Chosen option: keep the last 80 `message.posted` in the model prompt. When a turn starts over that cap, append `thread.compacted` `{ keptFrom, dropped }`. Last compact wins. UI and `crew log` still read the whole JSONL.

The prompt gets one user line: earlier messages were omitted; disk and JSONL still have them; do not resume cancelled jobs.

### Consequences

- Good, because cost and confusion stay bounded without a second store.
- Bad, because there is no LLM summary of the dropped span — only a marker.

### Confirmation

`packages/core/src/compact.ts`, `buildHistory`, `runBotTurn` calls `maybeCompact`. Spec: `docs/specs/session-jsonl.md`.
