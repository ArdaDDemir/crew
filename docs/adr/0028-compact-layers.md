---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# Compact is three append-only layers; no vendor blob

## Context and Problem Statement

`ADR-0019` windows the last 80 `message.posted` and appends `thread.compacted`. Dropped span has no LLM summary. Cost and cancelled-job confusion stay bounded, but a long thread loses intent. Vendor APIs (xAI opaque compaction items) would lock the log to one provider.

## Decision Drivers

- JSONL stays append-only (`ADR-0004`, `ADR-0019`). Never rewrite or delete lines.
- The human UI still shows the full thread.
- Prompt must not stuff `tool.completed` dumps.
- Compact model is a job (`jobs.json` compact.model later); until then, workspace default.
- No vendor compaction blob as source of truth.

## Considered Options

- Rewrite JSONL with an LLM summary.
- Store an xAI/OpenAI compaction blob on the event.
- Three layers: window marker, trim (posted-only history), append `thread.summary`.

## Decision Outcome

Chosen option: **three layers**. This qualifies `ADR-0019`; it does not replace the 80-message window.

1. **Window** — `HISTORY_KEEP` 80 + `thread.compacted` `{ keptFrom, dropped }` as in 0019.
2. **Trim** — `buildHistory` uses `message.posted` only. Do not inject `tool.completed` bodies. JSONL unchanged.
3. **Summary** — append `thread.summary` `{ text, keptFrom, model, botId }`. Prompt = latest summary as a user note (`Re-read paths you still need; disk is truth.`) + windowed posted after `keptFrom` (verbatim). Empty model text is an error, not a fake `(no summary)` line.

`POST /api/compact` `{ kind, id }` runs layer 3. Auto-compact when posted count > keep * 0.7, once per thread (sessionStorage). UI chip `{posted}/{keep}` plus `compacted` when a summary exists. Jobs UI is out of this ADR.

### Consequences

- Good, because the next model gets intent without a second store or a rewritten log.
- Good, because disk stays truth; bots are told to re-read paths after compact.
- Bad, because a cheap compact model can miss a decision — the JSONL still has it.
- Out of this ADR: Settings Jobs, vendor blob adapters, CLI TUI.

### Confirmation

`packages/core/src/compact.ts` (`summarizeThread`, `lastSummary`), `buildHistory`, `POST /api/compact`, `GET /api/compact-status`, `packages/core/src/compact.test.ts`, `apps/web/src/server.test.ts`. Spec: `docs/specs/session-jsonl.md`, `docs/specs/web-ui.md`.
