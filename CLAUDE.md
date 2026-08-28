# CLAUDE.md

You must follow **[AGENTS.md](./AGENTS.md)**. Read it before any edit. It is the project law.

This is **not** a Discord API bot, **not** a Claude Code/Codex wrapper, **not** Electron.

- Product: local multi-bot runtime (`crew` **0.4.0**). Channels + `@` wake + DMs. Surface: `bun run ui` or Crew.exe; CLI is tests/scripts.
- Stack: TypeScript + Bun. `bun test`. Desktop window: Tauri 2 + WebView2 (`ADR-0032`).
- TDD: failing test first.
- Architecture change: `docs/adr/` (do not rewrite accepted ADRs; next number in `docs/adr/README.md`; current **0036**).
- User-visible: `CHANGELOG.md` `[Unreleased]`.
- `packages/core`: no `fetch`, no CLI, no Discord. Fake provider in tests.
- Mentions: no `@` → no turn, except a human post with no mention wakes the channel lead.
- Default permission: `auto-accept` (workspace writes **and** workspace shell). Never `full-access` as the silent fallback for `auto`.
- Skills: Agent Skills `SKILL.md` (`ADR-0021`).
- Jobs are Settings slots, not People (`ADR-0029`). Implementation picker is one widget (`ADR-0031`).
- Providers cards store Claude/Codex/Grok/OpenCode. Enabled harness Person turns spawn that CLI (`ADR-0034`, `ADR-0035`). MCP stdio servers add tools on OpenRouter turns (`ADR-0036`).
- Design: `docs/superpowers/specs/2026-08-27-crew-runtime-design.md`

If AGENTS.md and this file drift, **AGENTS.md wins** — then fix this file in the same change.
