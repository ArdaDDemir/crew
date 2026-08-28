---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# Claude, Codex, and OpenCode Person turns spawn those CLIs

## Context and Problem Statement

`ADR-0034` spawned Grok. Claude / Codex / OpenCode still talked OpenRouter. Arda asked to finish the remaining harness work without stopping. Same office rules: mention wake, JSONL, account in the channel. Each CLI does desk work with its own tools.

## Decision Drivers

- Same `Provider.complete()` port; core has no `child_process`.
- One adapter package, not three copies of spawn/parse.
- Jobs stay OpenRouter.
- Unit tests inject a fake runner; never call the real CLIs.
- Headless CLIs cannot show TTY permission UIs inside Crew.

## Considered Options

- ACP stdio for each CLI.
- Duplicate `packages/provider-claude` etc.
- One `packages/provider-harness` with per-CLI argv + NDJSON parsers.

## Decision Outcome

Chosen option: **`packages/provider-harness` (`HarnessCliProvider`) for Claude, Codex, OpenCode, and Grok.**

Headless invoces (workspace cwd, prompt file, auto-approve, no Crew tool loop):

| Kind | Command |
|---|---|
| grok | `grok --prompt-file --output-format streaming-json --always-approve` (`ADR-0034`) |
| claude | `claude -p --output-format stream-json --verbose --permission-mode bypassPermissions --max-turns 8 --add-dir <prompt dir>` |
| codex | `codex exec --json --sandbox workspace-write -C <cwd> --ephemeral` |
| opencode | `opencode run --format json --auto --dir <cwd> --file <prompt>` |

Parse only account text / thinking / errors. Ignore tool-call events so Crew does not execute foreign tools. Host `harnessBind` runs when the person's (or workspace default) harness is enabled in Settings → Providers. Disabled/missing falls back to OpenRouter. Stop aborts the child. `--always-approve` / `--auto` / `bypassPermissions` / `workspace-write` because Crew cannot proxy those CLIs' permission UIs.

`packages/provider-grok` stays as the Grok-shaped parser/argv used by tests; host may use either Grok or the shared harness provider for Grok.

### Consequences

- Good, because every enabled harness Person actually runs that CLI.
- Bad, because Crew supervised / Always cards do not gate harness tools.
- Out of this ADR: MCP tab, plugin marketplace.

### Confirmation

`packages/provider-harness`, `apps/web/src/host.ts` `harnessBind`, CHANGELOG `[Unreleased]`, `docs/specs/provider.md`.
