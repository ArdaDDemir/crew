# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
with a 0.x policy: breaking changes bump the **minor** number until 1.0.

See `docs/versioning.md`.

## [Unreleased]

### Added

- Project governance: ADRs, specs, 0.x versioning.
- Design for local multi-bot runtime (channels, mentions, DMs, permission modes).
- Agent rule files: `AGENTS.md` (canonical) plus `CLAUDE.md`, `GEMINI.md`, Cursor/Copilot/Grok pointers (`ADR-0010`).
- CLI `crew`: `bot create`, `channel create`, `say`, `dm`, `open`, `mode`, `log`, `config`. Mention routing persists as JSONL under `.crew/logs/`.
- Agent turn loop with tools `read`, `apply_patch`, `list_dir`, `shell` and T3-shaped permission modes.
- OpenRouter (OpenAI-compatible) provider adapter.
- `crew config set/show` for model and API key (`~/.crew/config.json`).
- Provider errors print to stderr (`bot ERROR: ...`). 429/5xx retried; 429 messages are short (no raw JSON). Bot turns pause after a rate-limit.
- Default model `z-ai/glm-5.3-flash`. Live stream + thinking deltas. Fetch timeout 45s.
- Chat style (no `done:` protocol). `crew log` / `--thinking`. Auto-accept allows workspace `shell`. `list_dir` tool. File write lock.
- Coworker turns: work at the desk, then give an account in chat (ask if blocked, say if it failed). Default `say` / `log` hide thinking and tools; `--thinking` / `--verbose` (or `/thinking`, `/verbose`) show desk work.
- Engine-enforced desk vs account (`ADR-0012`).
- One turn per bot per `say` (`ADR-0013`). If you already `@` bots, this `say` does not wake anyone else (`ADR-0014`).
- `dm_send` tool: a bot in a channel can DM a member; the other bot answers once in that DM (`ADR-0015`).
- `crew dms` / `crew dms show a b` — human lists and reads every DM. Desk events stay in JSONL for the UI (`crew log` / `dms show --thinking --verbose`).
- Bots always reply in English, even if the human writes another language.
- Latest human message to a bot wins across channel and DM (`ADR-0016`). Channel turns get a DM pointer, not a dump. Disk is truth.
- Local web UI (`bun run ui`) on the same core: channel log with per-bot nameplates, DMs, composer, permission mode (`ADR-0017`).

### Fixed

- OpenAI adapter sends `tool_calls` as `{type:function, function:{name,arguments}}`. Z.AI dropped round-2 after `read` (`Inference processing failed`). That error retries once without tools.
- Courtesy `@` could restart the meeting until `ADR-0013` / `ADR-0014`.
- `@` inside a URL path (`github.com/@user`) is not a wake.
- `dm_send` does not give a second turn to a bot who already spoke this `say`.
- `apply_patch` with empty `old_text` no longer overwrites an existing file.
