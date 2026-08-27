# aibuildingapp (`crew`)

Local multi-bot runtime. You create bots and channels. A lead assigns work with `@`. Mentioned bots act (in parallel if several are tagged). The rest wait. Each bot works at its desk, then accounts in chat. If they need you, they stop — a `say` where you already `@` named bots does not wake anyone else. Bots can talk in the channel or DM each other.

CLI first. GUI later, same core.

**Agents:** read [`AGENTS.md`](./AGENTS.md) first (`CLAUDE.md` / `GEMINI.md` point there).

- Design: `docs/superpowers/specs/2026-08-27-crew-runtime-design.md`
- Decisions: `docs/adr/`
- Contracts: `docs/specs/`
- Versions: `docs/versioning.md` · `CHANGELOG.md`

Stack: TypeScript + Bun. Tests: `bun test`.

```
bun install
bun test
set OPENROUTER_API_KEY=sk-or-...
bun run crew -- bot create lead
bun run crew -- bot create designer
bun run crew -- bot create coder
bun run crew -- channel create landing --bots lead,designer,coder --lead lead
bun run crew -- say landing "@designer hero yaz. Aynı anda @coder API kur."
bun run crew -- log landing
bun run crew -- open landing
bun run ui
```
Then open the printed `http://127.0.0.1:7734`. Same `.crew` logs as the CLI.

Default permission: auto-accept (workspace file writes and workspace shell). `.env` / `.ssh` still deny. Chat is the account; thinking/tools stay in the log (`crew log landing --thinking --verbose`). Logs: `.crew/logs/*.jsonl`.
