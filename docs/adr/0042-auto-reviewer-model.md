---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# `auto` uses Settings reviewerModel

## Context and Problem Statement

`ADR-0007` / `permissions.md`: `auto` calls a reviewer model; missing reviewer falls back to `supervised`. Settings stored `reviewerModel`, but `sayChannel` / `sendDm` / `crew say` passed `hasReviewer: false` always. A room in `auto` was supervised no matter what the Permissions tab said.

## Decision Outcome

- `hasReviewer` is true iff `reviewerModel` is a non-empty string (project or user `config.json`).
- On `ask` verdicts in `auto`, core calls optional `review()` before the human card. The adapter runs one `complete()` on that model. Reply `ALLOW` / `DENY` settles the tool (`permission.resolved` `reviewer: true`). Anything else (including errors) → human ask.
- Still never `full-access`. Unit tests inject a fake provider; they do not call OpenRouter.

### Confirmation

`packages/core/src/turn.ts` `settleAsk`, `apps/web/src/host.ts` `bindReview`, `apps/cli/src/run.ts`, CHANGELOG `[Unreleased]`.
