---
status: accepted
date: 2026-08-31
decision-makers: Arda
---

# Harness spawn contract fixes and turn-stream keepalive

## Context and Problem Statement

Field testing on this machine broke three accepted contracts in practice:

1. `ADR-0035` table records OpenCode spawn as `opencode run --format json --auto --dir <cwd> --file <prompt>` with the brief message as a trailing positional. opencode's `--file` is a **yargs array option**: with no `-m` model flag after it, it swallowed the message as a second attachment and every default OpenCode turn died with `Error: File not found` on stderr (empty stdout → a bare "OpenCode exited 1").
2. With no model configured, `DEFAULT_HARNESS_MODEL.opencode` was empty, so `opencode run` fell back to its own provider auto-routing, which picked endpoints without tool use (`No endpoints found that support tool use`).
3. Long silent tool phases killed the turn **stream**: Bun.serve's default 10s idle timeout closed `/api/say` while the turn kept running server-side. The UI showed `TypeError: network error` for turns that actually finished. T3 Code avoids this class by using WebSocket with pings; Crew's NDJSON needs its own keepalive.

## Decision Outcome

Amends `ADR-0034` / `ADR-0035` (spawn details only; the ports, the office rules, and "core has no `child_process`" stand).

1. **OpenCode argv**: the Crew brief is the **first positional after `run`**, before any flags — an array-typed flag can no longer eat it. Full shape: `opencode run <brief> --format json --auto --dir <cwd> --file <prompt> [-m <model>] [--variant <effort>] [--mcp-config <path>]`.
2. **Every harness kind has a non-empty default model.** OpenCode default is `opencode/big-pickle` (tool-capable, free). Crew never relies on a CLI's provider auto-routing.
3. **stderr is drained** for every harness spawn (an unread pipe can block the child on Windows). If a CLI exits non-zero with **no parsed stdout events**, the error event is `<Label> exited <code>: <last stderr line>` (≤240 chars) so real causes surface.
4. **Reasoning effort rides the turn.** `ChatRequest` gains `effort?`; the person record persists it. OpenRouter turns send `reasoning_effort`; OpenCode turns send `--variant <effort>`; Grok / Claude / Codex ignore it for now. Default/empty sends nothing — some models have no effort.
5. **Turn-stream keepalive.** `POST /api/say` streams `{"type":"ping"}` NDJSON rows every 5s while the turn runs, and the office server sets `idleTimeout: 255`. The UI ignores ping rows and maps a dropped stream to "Connection to the office was lost…" instead of a raw fetch error.

Not this ADR: effort support for the other harness CLIs, job-runner effort, WebSocket transport.

### Confirmation

TDD: argv order tests, stderr-drain + exit-message tests, `--variant` / `reasoning_effort` tests, heartbeat ping test. Specs updated in the same change: `docs/specs/provider.md`, `docs/specs/web-ui.md`, `docs/specs/bots-and-channels.md`. CHANGELOG `[Unreleased]`.
