# CLAUDE.md

You must follow **[AGENTS.md](./AGENTS.md)**. Read it before any edit. It is the project law.

This is **not** a Discord bot, **not** a Claude Code/Codex wrapper, **not** an Electron app in v1.

- Product: local multi-bot runtime (`crew`). Channels + `@` wake + DMs. CLI first.
- Stack: TypeScript + Bun. `bun test`.
- TDD: failing test first.
- Architecture change: `docs/adr/` (do not rewrite accepted ADRs).
- User-visible: `CHANGELOG.md` `[Unreleased]`.
- `packages/core`: no `fetch`, no CLI, no Discord. Fake provider in tests. No live OpenRouter in unit tests.
- Mentions: no `@` → no turn, except a human post with no mention wakes the channel lead.
- Default permission: `auto-accept` (workspace file writes **and** workspace shell). Never `full-access` as the silent fallback for `auto`.
- Design: `docs/superpowers/specs/2026-08-27-crew-runtime-design.md`

If AGENTS.md and this file drift, **AGENTS.md wins** — then fix this file in the same change.
