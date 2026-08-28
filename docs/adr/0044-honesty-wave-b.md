---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# Honesty pack Wave B/C

## Context and Problem Statement

Wave A (`ADR-0043`) fixed false `@`, secret `list_dir`, Jobs harness, empty accounts, and Stop grandchildren. Still open: `mcp_*` tools map to `shell` so auto-accept runs them; the reviewer treats `YES` as ALLOW; `type .env` is workspace shell; parallel `echo > file` races `apply_patch`; a channel turn is told every DM id, not unread ones.

## Decision Outcome

Qualifies `ADR-0007`, `ADR-0016`, `ADR-0036`, `ADR-0042`, `ADR-0043`.

1. `ToolKind` adds `mcp`. `mcp_*` is that kind, not `shell`. auto-accept **asks**. Tests with `live: false` still auto-allow the card.
2. `parseReviewerVerdict` accepts only the first token `ALLOW` / `DENY` / `ASK`. `YES`, empty, and synonyms → `ask`.
3. `hardDenyCommand` (`.env`, `.ssh`, `rm -rf /`, `irm`, `curl|iex`) denies shell in every mode and skips the reviewer.
4. `shellLockPath`: `>` / `>>` target, or `git` → `.git`. `spawnSync` runs under the same in-process lock as `apply_patch`. `old_text not found` tells the model to re-read the file.
5. Channel cross-thread note: a DM is unread only if its last **human** post is after this bot’s last channel account. Pointer is a count + newest gist (120 chars), not every id.

Not this ADR: Discord, `crew serve`, computer-use, Wave A items already shipped.

### Confirmation

`packages/core` permissions/turn/orders, `packages/tools-native` shell, `apps/web` reviewer prompt, CHANGELOG `[Unreleased]`.
