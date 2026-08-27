# AGENTS.md — read this before writing any code

This is the source of truth for every coding agent (Claude, Cursor, Codex, Gemini, Grok, Copilot, OpenCode, Aider, humans).

Türkçe özet: Bu repo bir Discord botu değil. Yerelde Grok Bot takımı: sen kanal + bot açarsın, `@etiket` uyanır, diğerleri bekler, botlar DM’leşir. v1 = CLI. GUI sonra. Kurallar: TDD, ADR, `packages/core` I/O’suz.

If this file disagrees with chat lore, **this file + `docs/adr/` win**. Update them in the same PR as the code.

## What this is

Local multi-bot runtime. Working CLI name: `crew`. Repo: `aibuildingapp`.

Human creates **bots** (soul, skills) and **channels** (members, lead, `RULES.md`, `CONTEXT.md`). A lead assigns work with `@designer` / `@coder`. **Mention = wake.** Unmentioned bots wait. Several `@` in one message → those bots may run in parallel. Bots work at their desk (tools + thinking), then **give an account** in the channel like coworkers: what they did, what's missing, what failed. They may **DM** each other. Human can read every DM.

v1 surface: CLI. Later: GUI on the **same** `packages/core` events. We own the agent loop. OpenRouter (OpenAI-compatible `base_url`) is the model.

## What this is NOT

Do **not** start building any of these. They are the usual wrong first commit:

| Not this | Reality |
|---|---|
| discord.js / Discord API bot | Discord-like **data model** only. Real Discord is a later adapter. |
| Wrapper around Claude Code, Codex, OpenCode, Grok CLI | We are the engine. T3 Code is UI/permission **inspiration**, not a dependency. |
| Electron / T3 desktop in v1 | CLI first. |
| Single ChatGPT REPL | Product is bots + channels + mentions + DMs. |
| Cloud VM / computer-use | Work is the human’s machine. |
| New YAML skill format | Agent Skills `SKILL.md` only. |
| Python, Rust, or Go rewrite | TypeScript + Bun (`ADR-0009`). |

## Read in this order

1. This file
2. `docs/superpowers/specs/2026-08-27-crew-runtime-design.md`
3. `docs/specs/mentions-and-routing.md` (scheduler)
4. `docs/adr/README.md` then any ADR you are about to violate
5. `docs/versioning.md` + `CHANGELOG.md` `[Unreleased]` for user-visible work

Contracts: `docs/specs/`. Do not invent a parallel spec in a README.

## Commands

Bun is required. On this Windows machine the npm shim may live at `%APPDATA%\npm\bun.cmd` if `bun` is not on PATH.

| Command | What |
|---|---|
| `bun test` | All tests (default) |
| `bun test packages/core` | Domain tests |
| `bun run crew -- bot create lead` | CLI (cwd gets `.crew/`) |

There is no `dev` server in v1. There is no Docker.

## Layout

```
packages/core          domain + ports. NO fetch, NO clap, NO discord, NO console-as-product
packages/store-jsonl   append-only JSONL EventStore
packages/workspace-fs  .crew/ bots + channels on disk
apps/cli               `crew` argv adapter
docs/adr               decisions (immutable once accepted)
docs/specs             wire contracts
```

`core` is tested with a scripted fake provider. Never call OpenRouter from unit tests.

## Hard rules

1. **TDD.** Failing test first. Watch it fail for the right reason. Then minimal code. No production code without that.
2. **Architecture change → ADR.** Next number in `docs/adr/`. Do not rewrite an accepted ADR; supersede it. Touch `docs/adr/README.md` index.
3. **User-visible change → `CHANGELOG.md` `[Unreleased]`.** Keep a Changelog headings.
4. **Mention routing is the scheduler.** No tag → no turn (except human post with no `@` wakes the channel **lead**). `@everyone` wakes every **bot** member except the author. Unknown `@foo` is ignored. Spec: `docs/specs/mentions-and-routing.md`.
5. **Permissions.** Four modes: `supervised` \| `auto-accept` (default) \| `auto` \| `full-access`. Auto-accept = workspace file writes **and** workspace `shell` allowed. `supervised` still asks. `auto` without a reviewer model **falls back to supervised**, never to full-access. Always deny `.env` and `~/.ssh`. Approvals are events, not `stdin` inside a tool. Spec: `docs/specs/permissions.md`.
6. **Sessions are append-only JSONL** with `"v": 1`. Never rewrite a line. Spec: `docs/specs/session-jsonl.md`.
7. **Provider is a port.** `complete(req) -> AsyncIterable<ChatEvent>`. OpenRouter is an adapter. Core does not import `@openrouter/*`.
8. **Skills = `SKILL.md`.** Channel `RULES.md` + `CONTEXT.md` load on every turn in that channel. Bot `SOUL.md` is voice, not a skill.
9. **0.x semver.** Breaking public API (CLI flags, JSONL types, mode names, skill frontmatter) bumps **minor** until 1.0. Start/stay honest: we are `0.1.0`.
10. **Scope.** Do not add GUI, real Discord, MCP, git-PR buttons, fullscreen TUI, or a second provider SDK unless the human asked in this session.

## Testing

- Domain tests: real functions, temp dirs for tools, **scripted fake LLM**.
- Do not assert on mock internals. Assert on `woken` lists, events, files on disk.
- A test that needs the network is not a unit test.

v1 is in: mention routing, JSONL, workspace, turn loop, tools, OpenRouter adapter, CLI (`bot`, `channel`, `say`, `dm`, `open`, `mode`, `log`). Channel text is the **account after desk work** (`ADR-0012`): tool-round `text-delta` is not posted. Next features need an ADR if they change the public surface.

## Code style

- TypeScript, ESM, Bun.
- Small modules. Router does not stream tokens. Tools do not print.
- Ports as interfaces in `core`; adapters outside.
- No `any` unless a test fixture forces it; prefer explicit unions (`Post`, `Participant`).

## Environment (later CLI)

- `OPENROUTER_API_KEY`
- optional `CREW_BASE_URL` (OpenAI-compatible)

Not required to run `bun test`.

## When you are lost

The product sentence: **human owns channels; `@` wakes bots; bots may DM; CLI first; core has no UI.**

If a change would make that sentence false, stop and write an ADR.
