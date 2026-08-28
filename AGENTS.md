# AGENTS.md — read this before writing any code

This is the source of truth for every coding agent (Claude, Cursor, Codex, Gemini, Grok, Copilot, OpenCode, Aider, humans).

Türkçe özet: Discord API botu değil. Yerelde Grok Bot takımı: kanal + kişi, `@id` uyanır, diğerleri bekler, masada işler kanalda hesap verir, insana ihtiyaç varsa dururlar, DM’leşirler. Yüzey: `bun run ui` veya Crew.exe. `crew` CLI test/script, TUI değil. TDD, ADR, `packages/core` I/O’suz.

If this file disagrees with chat lore, **this file + `docs/adr/` win**. Update them in the same PR as the code.

## What this is

Local multi-bot runtime. Working name: `crew`. Repo: `aibuildingapp`. Version: **0.7.0**.

Human creates **bots** (soul, skills) and **channels** (members, lead, `RULES.md`, `CONTEXT.md`, folders). A lead assigns work with `@coder`. **Mention = wake.** Unmentioned bots wait. Several `@` in one message → those bots may run in parallel. Bots work at their desk (tools + thinking), then **give an account** in the channel. They may **DM**. Human can read every DM.

Surface: **local web UI** `bun run ui` **or Crew.exe** (`ADR-0017`, `ADR-0020`, `ADR-0023`–`0042`). CLI `crew` is for **tests and scripts**, not a TUI product (`docs/todos/cli-is-script.md`). Jobs (title, compact, vision, read) are Settings slots, not People (`ADR-0029`, `ADR-0031`). Compact is three append-only layers: window, trim, LLM summary (`ADR-0019`, `ADR-0028`). Settings → Providers feeds the Person / Default implementation picker (`ADR-0030`, `ADR-0031`). Jobs pickers are OpenRouter-only (`ADR-0043`). Enabled Grok / Claude / Codex / OpenCode Person turns spawn that CLI (`ADR-0034`, `ADR-0035`). MCP stdio/HTTP tools, resources, and prompts attach to OpenRouter turns (`ADR-0036`, `ADR-0038`). Same `packages/core`. Snapshot + gaps: `docs/todos/now.md`.

## What this is NOT

Do **not** start building any of these unless the human asked in this session:

| Not this | Reality |
|---|---|
| discord.js / Discord API bot | Discord-like **data model** and member list. Real Discord is a later adapter. |
| Wrapper around Claude Code, Codex, OpenCode, Grok CLI | We are the engine. T3 is Settings / picker / permission inspiration. Enabled harness Person turns spawn that CLI (`ADR-0034`, `ADR-0035`). |
| Electron / T3 desktop | Local UI is `apps/web`. Window is **Tauri 2 + WebView2** (`ADR-0032`), not Electron. |
| Single ChatGPT REPL | Product is bots + channels + mentions + DMs. |
| Cloud VM / computer-use | Work is the human’s machine. |
| New YAML skill format | Agent Skills `SKILL.md` only (`ADR-0021`). |
| Python, Rust, or Go rewrite | TypeScript + Bun (`ADR-0009`). |
| `crew serve` / multi-human | Parked: `docs/todos/multi-human-remote.md`. |
| Computer-use / in-app browser | Parked: `docs/todos/computer-use-and-browser.md`. |

## Read in this order

1. This file
2. `docs/superpowers/specs/2026-08-27-crew-runtime-design.md`
3. `docs/specs/mentions-and-routing.md` (scheduler)
4. `docs/adr/README.md` then any ADR you are about to violate
5. `docs/versioning.md` + `CHANGELOG.md` `[Unreleased]` for user-visible work. Snapshot: `docs/todos/now.md`.
6. Specs you touch: `docs/specs/cli.md`, `skills.md`, `web-ui.md`, `permissions.md`, `session-jsonl.md`, `bots-and-channels.md`, `provider.md`

Contracts: `docs/specs/`. Do not invent a parallel spec in a README.

## Commands

Bun is required. On this Windows machine the npm shim may live at `%APPDATA%\npm\bun.cmd` if `bun` is not on PATH.

| Command | What |
|---|---|
| `bun test` | All tests |
| `bun test packages/core` | Domain tests |
| `bun run crew -- …` | CLI (cwd gets `.crew/`) |
| `bun run ui` | Local office `http://127.0.0.1:7734` |
| `bun run desktop` | Crew.exe window (Tauri dev; same office) |
| `bun run desktop:build` | Compile sidecar + Tauri `Crew.exe`; try NSIS + MSI |

No Docker.

## Layout

```
packages/core          domain + ports. NO fetch, NO clap, NO discord, NO console-as-product
packages/store-jsonl   append-only JSONL EventStore
packages/workspace-fs  .crew/ bots + channels on disk
packages/tools-native  read / apply_patch / list_dir / shell
packages/provider-openai  OpenRouter-compatible adapter
packages/provider-grok    Grok CLI spawn adapter (`ADR-0034`)
packages/provider-harness Claude / Codex / OpenCode / Grok spawn (`ADR-0035`)
apps/cli               `crew` argv adapter
apps/web               local UI adapter (Bun.serve); providers, jobs, mcp json
apps/desktop           Crew.exe (Tauri + WebView2); sidecar is compiled `apps/web`
docs/adr               decisions (immutable once accepted; next is 0045)
docs/specs             wire contracts
```

`core` is tested with a scripted fake provider. Never call OpenRouter from unit tests.

## Hard rules

1. **TDD.** Failing test first. Watch it fail for the right reason. Then minimal code.
2. **Architecture change → ADR.** Next number in `docs/adr/`. Do not rewrite an accepted ADR; supersede it. Touch `docs/adr/README.md`.
3. **User-visible change → `CHANGELOG.md` `[Unreleased]`.** Keep a Changelog headings.
4. **Mention routing is the scheduler.** No tag → no turn (except human post with no `@` wakes the **lead**). `@everyone` wakes every **bot** member except the author. Unknown `@foo` is ignored. `@` inside fenced or inline code is not a wake (`ADR-0043`). **One turn per bot per `say`** (`ADR-0013`). If the human already `@` named bots, no handoff wave (`ADR-0014`).
5. **Permissions.** `supervised` \| `auto-accept` (default) \| `auto` \| `full-access`. Auto-accept = workspace file writes **and** workspace `shell`. `mcp_*` tools **ask** on auto-accept (`ADR-0044`). `auto` without a reviewer **falls back to supervised**. Reviewer first token is `ALLOW`/`DENY`/`ASK` only. Always deny `.env` and `~/.ssh`. Hard-deny shell: `.env`, `.ssh`, `rm -rf /`, `irm`, `curl|iex`. Always-allow fingerprints live in `.crew/permissions.json` (`ADR-0018`). Settings can **Add** / remove one row (`POST` / `DELETE /api/permissions`). New rooms use `defaultPermissionMode`.
6. **Sessions are append-only JSONL** `"v": 1`. Never rewrite a line. Compact is three layers: 80-message **window** (`thread.compacted`, `ADR-0019`), **trim** (posted-only prompt), **LLM summary** (`thread.summary`, `ADR-0028`). Titles append `thread.titled` (`ADR-0029`).
7. **Provider is a port.** `complete(req) -> AsyncIterable<ChatEvent>`. Core does not import `@openrouter/*` or spawn CLIs. Enabled Grok/Claude/Codex/OpenCode Person turns spawn that CLI in adapter packages (`ADR-0034`, `ADR-0035`). Jobs stay OpenRouter.
8. **Skills = Agent Skills `SKILL.md`.** Slug name, YAML frontmatter, body in the prompt (`ADR-0021`). Channel `RULES.md` + `CONTEXT.md` every turn. `SOUL.md` is voice.
9. **0.x semver.** Public API breaks bump **minor** until 1.0. We are **0.7.0**.
10. **Scope.** Do not add Electron, real Discord, git-PR, `crew serve`, or a plugin marketplace unless asked this session. MCP is Settings → MCP (`ADR-0036`, `ADR-0038`). Local UI is `apps/web`; the window is `apps/desktop` (`ADR-0032`).
11. **Reserved bot ids:** `human`, `you`, `everyone`, `engine` (`ADR-0022`). Max 16 bots, 16 channels.
12. **UI copy is English.** The human may write Turkish; bots account in English.

## Testing

- Domain tests: real functions, temp dirs for tools, **scripted fake LLM**.
- Assert on `woken` lists, events, files on disk — not mock internals.
- A test that needs the network is not a unit test.

## Code style

- TypeScript, ESM, Bun. Small modules. Ports in `core`; adapters outside.
- No `any` unless a test fixture forces it.

## Environment

- `OPENROUTER_API_KEY`
- optional `CREW_BASE_URL`, `CREW_MODEL`

Not required to run `bun test`.

## When you are lost

The product sentence: **human owns channels; `@` wakes bots; they work at the desk then account; need-human is a stop; bots may DM; local web (`bun run ui`) or Crew.exe is the office; CLI is tests/scripts; core has no UI.**

If a change would make that sentence false, stop and write an ADR.
