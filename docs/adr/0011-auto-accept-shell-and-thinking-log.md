---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# Auto-accept includes workspace shell; thinking is logged not dumped

## Context and Problem Statement

`say` has no TTY, so `auto-accept` + shell=`ask` became a silent deny. Bots looped on `ls` / `cat > file`. Chat used a "done:" protocol. Thinking mixed into the channel stream.

## Decision Outcome

- `auto-accept`: workspace `shell` is **allow** (still deny `.env` / `.ssh`). `supervised` still asks.
- Channel talk is chat ("bak şunu yaptım"), not `done:`.
- Reasoning is always stored as `assistant.reasoning`. Live print only with `--thinking` or `/thinking on`. Replay: `crew log <channel> --thinking`.

### Confirmation

`packages/core/src/permissions.ts`, `prompt.ts`, `crew log`, `--thinking`.
