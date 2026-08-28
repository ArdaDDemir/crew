---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# Honesty and safety hardening (Wave A)

## Context and Problem Statement

Crew 0.6.0 is a working Windows office. Remaining pain is lies and footguns: `@` inside code fences wakes bots; `list_dir` shows `.crew`; Jobs picker stores a harness id then OpenRouter is called; a model can run tools and post no account; Stop may leave `grok.exe` grandchildren alive. Discord / `crew serve` / computer-use stay parked.

## Decision Outcome

One ADR for a 0.7 honesty pack. **Wave A (this slice):**

1. `parseMentions` masks fenced/inline code, then the existing regex. URL `/@user` skip stays.
2. `list_dir` skips `.crew`, `.git`, `.ssh`, `.env`, `.env.*`.
3. Jobs resolve OpenRouter only; job pickers hide harness groups.
4. If tools ran and the model never accounted, the engine supplies an English stop line (`I stopped after N tool call(s)…`).
5. Harness spawn: on abort, `proc.kill()` then Windows `taskkill /PID /T /F` (injected in tests).

Wave B/C (MCP kind, conservative reviewer, shell lock, unread DM pointer) are later slices of the same pack, not this commit set.

Not this ADR: Discord, `crew serve`, computer-use, marketplace, plan-approve JSONL, worktrees, signed CDN.

### Confirmation

`packages/core` mentions/turn, `packages/tools-native` list_dir, `packages/provider-harness` spawn, `apps/web` jobs picker, CHANGELOG `[Unreleased]`.
