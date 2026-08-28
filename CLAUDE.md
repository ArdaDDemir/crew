# CLAUDE.md

You must follow **[AGENTS.md](./AGENTS.md)**. Read it before any edit. It is the project law.

This is **not** a Discord API bot, **not** a Claude Code/Codex wrapper, **not** Electron.

- Product: local multi-bot runtime (`crew` **0.3.0**). Channels + `@` wake + DMs. Surface: `bun run ui`; CLI is tests/scripts.
- Stack: TypeScript + Bun. `bun test`.
- TDD: failing test first.
- Architecture change: `docs/adr/` (do not rewrite accepted ADRs; next number in `docs/adr/README.md`).
- User-visible: `CHANGELOG.md` `[Unreleased]`.
- `packages/core`: no `fetch`, no CLI, no Discord. Fake provider in tests.
- Mentions: no `@` → no turn, except a human post with no mention wakes the channel lead.
- Default permission: `auto-accept` (workspace writes **and** workspace shell). Never `full-access` as the silent fallback for `auto`.
- Skills: Agent Skills `SKILL.md` (`ADR-0021`).
- Design: `docs/superpowers/specs/2026-08-27-crew-runtime-design.md`

If AGENTS.md and this file drift, **AGENTS.md wins** — then fix this file in the same change.
