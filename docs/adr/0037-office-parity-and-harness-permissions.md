---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# CLI parity, harness permission map, MCP URL/env, Windows NSIS

## Context and Problem Statement

Gaps after `ADR-0034`–`0036`: `crew say` ignored harness/MCP; harness always auto-approved; `.env` deny was Grok-only; MCP had no env field or HTTP; installer was a portable folder only.

## Decision Drivers

- T3 maps thread mode onto each CLI’s flags; headless cannot show that CLI’s TTY prompt.
- Same spawn/MCP as the office must work from `crew say` / `crew dm`.
- Core stays I/O-free.
- Windows is the machine we have; macOS/Linux installers wait.

## Decision Outcome

- **Supervised → no harness spawn.** That turn uses Crew OpenRouter + permission cards. Headless `default` would hang.
- **auto-accept** → Claude/Grok `acceptEdits`; Codex `workspace-write`; OpenCode `--auto`.
- **auto** → Claude/Grok `--permission-mode auto`; others same as auto-accept.
- **full-access** → Claude/Grok `bypassPermissions`; Codex `workspace-write`; OpenCode `--auto`. All CLIs still get `.env` / `.ssh` deny flags or an append-system-prompt equivalent.
- `crew say` / `crew dm` bind `HarnessCliProvider` and MCP the same way as `apps/web` host (`providerForBot` + `collectMcpSessions`). Tests inject `harnessRun` / `mcpConnect`.
- MCP server may have `env` (UI KEY=value lines) and `url` (JSON-RPC HTTP, optional SSE `data:`). Stdio stays. Enabled servers are written to a temp Claude-shaped `mcp-config.json` and passed as `--mcp-config` on Grok/Claude (and argv for others that accept it).
- Desktop **NSIS** installer via Tauri bundle in addition to `dist/crew-windows/` portable. No updater endpoint in this ADR. No macOS/Linux bundle.

### Confirmation

`packages/provider-harness` argv `mode`, `apps/cli/src/run.ts` `providerForBot`, `apps/web/src/mcp.ts` `url`/`env`, `apps/desktop/src-tauri/tauri.conf.json` `nsis`, CHANGELOG 0.4.0.
