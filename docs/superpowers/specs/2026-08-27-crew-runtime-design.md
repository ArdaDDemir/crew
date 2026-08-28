# Crew runtime — design

Date: 2026-08-27  
Status: accepted. Shipped: local office UI (`bun run ui`, `ADR-0017`–`0029`); CLI is tests/scripts. Electron / Discord API / `crew serve` still out. Current law: `AGENTS.md` + `docs/adr/`.  
CLI working name: `crew` (repo: `aibuildingapp`)

## What this is

A **local Grok Bot**. You create bots (lead, designer, coder, tester). You create a **channel**, pick who is in it, give that channel **rules** and **context**. A lead `@designer şunu yap @coder şunu yap` der. Etiketlenmeyenler bekler. Botlar kanalda konuşur ve birbirlerine **DM** atabilir.

Surface: local web UI (`bun run ui`) on the same engine; CLI is tests/scripts (`docs/todos/cli-is-script.md`). Not a wrapper around Claude/Codex. We own the loop. OpenRouter (or any OpenAI-compatible `base_url`) is the brain.

Coding is not a separate app. A `coder` bot has file/shell hands. T3’s three-pane UI and PR buttons are later.

## Why these references

| Steal | From | Not steal |
|---|---|---|
| Named bots, group, `@`, bot-bot messages, skills | Grok Bot | Cloud VM, computer-use, 50 routines |
| Four permission modes, inline ask, auto-accept workspace | T3 Code | Driving foreign CLIs, Electron control plane |
| Core library + events, UI is a client | Codex SQ/EQ | 100-crate Rust rewrite in v1 |
| `SKILL.md` | Agent Skills spec | A new YAML skill format |

## v1 in one loop

Human opens channel `landing` with members `lead, designer, coder, tester`.

1. Human: `@lead landing sayfasını çıkar`
2. Engine wakes **only** `lead` (mentioned). Others wait.
3. Lead replies in the channel: `@designer hero yaz. Aynı anda @coder API iskeletini kur.`
4. Engine wakes **designer and coder in parallel**. Tester still waits.
5. Coder DMs tester a private note, **or** the human later `say`s `@tester kır`. A worker `@tester` in the same `say` does not wake tester (`ADR-0014`).
6. File writes and workspace shell inside the project folder pass without asking (`auto-accept`). Paths outside the folder ask. Human can switch to `supervised` / `auto` / `full-access`.
7. Each woken bot works at its desk, then posts an account in the channel (what they did, what's missing, what failed). Thinking/tools are not the channel message (`ADR-0012`). If they need the human, they stop (`ADR-0013`). One turn per bot per `say`.

## Architecture

```
apps/cli                 driving adapter (argv + REPL)
apps/web                 driving adapter (Bun.serve, 127.0.0.1:7734)
        │ Command / Event
packages/core            bots, channels, mentions, turns, permissions
        │ ports
adapters: provider-openai | jsonl-store | native-tools
```

`core` has no `fetch`, no `console` as product output, no Discord. Tests construct core with a `ScriptedProvider` and an in-memory store.

CLI talks in-process. The local UI is HTTP on localhost (`ADR-0017`). Core still has no HTTP.

### Components

| Unit | Does | Depends on |
|---|---|---|
| Router | parse `@`, decide who wakes, queue per (thread, bot) | Channel membership |
| Turn loop | one bot, one thread: model stream → tools → until stop | Provider, Tools, Permissions, Store |
| Permissions | four modes + hard denials | Path jail |
| Store | append JSONL, read back | filesystem adapter |
| Tools | `read`, `apply_patch`, `list_dir`, `shell` | host (cwd) |

### Data flow (mention fan-out)

`PostMessage` → persist `message.posted` → `woken[]` → for each bot `bot.woken` + `bot.turn.started` → stream `assistant.delta` / tools → `bot.turn.completed`.

### Errors

- Unknown `@` : ignore for routing.
- Bot busy in that thread: queue the wake.
- Provider fail: `error` event, that bot’s turn ends; sibling parallel turns continue.
- Permission deny: tool result is an error string; the model may retry or ask the human.
- `auto` with no reviewer model: behave as `supervised` and warn once.

## Testing (TDD)

Pyramid for v1:

1. Domain: mention parse, fan-out, lead fallback, queue-while-busy, channel rules injected (no I/O)
2. Permissions: auto-accept vs supervised on a temp dir
3. Provider contract: SSE / fake scripted events
4. CLI smoke later

No live OpenRouter in unit tests.

## Repo layout

```
packages/core          domain + ports
packages/provider-openai
packages/tools-native
packages/store-jsonl
apps/web               bun run ui
apps/cli               tests/scripts
docs/adr docs/specs
```

## v1 / not v1

**v1 (0.3.0):** local web UI `bun run ui` on the hexagonal core. CLI `crew` is tests/scripts, not a TUI. Bots/channels/DMs, `@` routing, one turn per bot per `say`, human-tagged stop, four permission modes, OpenRouter, tools (`read`, `apply_patch`, `list_dir`, `shell`, `dm_send`, org tools), SKILL.md, JSONL, Always persist, compact layers, Jobs, ADRs.

**Not v1:** Electron, real Discord API, fullscreen TUI, MCP, git auto-PR, cloud computer, `crew serve` / multi-human remote, routines/cron.

## Open names

CLI binary `crew` is a working title. Domain words (bot, channel, mention, dm) are frozen.
