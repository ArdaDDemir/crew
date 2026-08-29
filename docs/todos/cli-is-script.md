# CLI is not a product surface

Status: parked as a TUI. Keep `crew` for **tests and scripts** only.  
Date: 2026-08-27

Claude Code / Codex / Grok Build **are** their CLIs (fullscreen TUI, 50–100 slash commands). Crew is an **office UI**. Do not grow `crew open` into a Grok-style TUI (`AGENTS.md`: no fullscreen TUI).

Keep:

- `bun test` / scripted `crew say` / `crew log` / `bot create` in tests
- Thin `crew open` only if a test or Arda needs a REPL

Do **not** add: TUI themes, `/vim`, `/mcp`, session picker, worktrees, CLI slash parity as a goal.

New human controls land in **`bun run ui`** / **`crew serve`** (loopback HTTP, `ADR-0048`). Same engine. If a slash exists, it is a UI composer command first. `crew serve` is not a TUI.
