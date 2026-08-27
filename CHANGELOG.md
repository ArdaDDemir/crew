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
- CLI `crew`: `bot create`, `channel create`, `say`, `dm`, `open`, `mode`. Mention routing persists as JSONL under `.crew/logs/`.
- Agent turn loop with tools `read`, `apply_patch`, `shell` and T3-shaped permission modes.
- OpenRouter (OpenAI-compatible) provider adapter.
- `crew config set/show` for model and API key (`~/.crew/config.json`).
- Provider errors print to stderr (`bot ERROR: ...`). 429/5xx retried; 429 messages are short (no raw JSON). Bot turns pause after a rate-limit.
- Default model `z-ai/glm-5.3-flash`. Live stream + thinking deltas. Fetch timeout 45s.
- Chat style (no `done:` protocol). `crew log` / `--thinking`. Auto-accept allows workspace `shell`. `list_dir` tool. File write lock.
- Coworker turns: work at the desk, then give an account in chat (ask if blocked, say if it failed). Default `say` / `log` hide thinking and tools; `--thinking` / `--verbose` (or `/thinking`, `/verbose`) show desk work.
- Engine-enforced desk vs account (`ADR-0012`): tool-round mutter is not the channel message. After tools, one nudge to give an account.
