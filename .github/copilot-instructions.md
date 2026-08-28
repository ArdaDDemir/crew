# GitHub Copilot instructions

Read and obey `/AGENTS.md` at the repo root before suggesting or applying edits.

This repository is a **local multi-bot runtime** (working name `crew`), not a Discord.js bot and not a wrapper around Claude Code / Codex / OpenCode.

- TypeScript + Bun. Run `bun test`.
- TDD: add a failing test before production code.
- Keep I/O out of `packages/core`.
- Mention routing (`@slug`) decides which bots wake. See `docs/specs/mentions-and-routing.md`.
- Architecture changes need a new file in `docs/adr/`.
- Local UI is `apps/web` (`bun run ui`). Do not add Electron, Discord API, MCP, or `crew serve` unless asked.
