# Crew runtime — design

Date: 2026-08-27  
Status: accepted for v1 implementation  
CLI working name: `crew` (repo: `aibuildingapp`)

## What this is

A **local Grok Bot**. You create bots (lead, designer, coder, tester). You create a **channel**, pick who is in it, give that channel **rules** and **context**. A lead `@designer şunu yap @coder şunu yap` der. Etiketlenmeyenler bekler. Botlar kanalda konuşur ve birbirlerine **DM** atabilir.

First surface: **CLI**. Later: a GUI on the same engine (T3-like composer + permission modes). Not a wrapper around Claude/Codex. We own the loop. OpenRouter (or any OpenAI-compatible `base_url`) is the brain.

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
5. Coder DMs tester a private note **or** later posts `@tester kır` in the channel.
6. File writes and workspace shell inside the project folder pass without asking (`auto-accept`). Paths outside the folder ask. Human can switch to `supervised` / `auto` / `full-access`.
7. Each woken bot works at its desk, then posts an account in the channel (what they did, what's missing, what failed). Thinking/tools are not the channel message.

## Architecture

```
apps/cli                 driving adapter (argv + REPL)
        │ Command / Event
packages/core            bots, channels, mentions, turns, permissions
        │ ports
adapters: provider-openai | jsonl-store | native-tools
```

`core` has no `fetch`, no `console` as product output, no Discord. Tests construct core with a `ScriptedProvider` and an in-memory store.

v1 transport is in-process. HTTP is not required until a GUI needs a process boundary.

### Components

| Unit | Does | Depends on |
|---|---|---|
| Router | parse `@`, decide who wakes, queue per (thread, bot) | Channel membership |
| Turn loop | one bot, one thread: model stream → tools → until stop | Provider, Tools, Permissions, Store |
| Permissions | four modes + hard denials | Path jail |
| Store | append JSONL, read back | filesystem adapter |
| Tools | `read`, `apply_patch`, `shell` | host (cwd) |

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
apps/cli
docs/adr docs/specs
```

## v1 / not v1

**v1:** bot create, channel create (members + lead + rules/context), `say` / `open` REPL, `@` routing, parallel wakes, bot-bot and human-bot DM, four permission modes (default auto-accept), OpenRouter, read/apply_patch/shell, JSONL, ADRs, 0.1.0.

**Not v1:** second GUI, real Discord, fullscreen TUI, MCP, git auto-PR, cloud computer, routines/cron, `@everyone` abuse controls beyond “wake all bots”.

## Open names

CLI binary `crew` is a working title. Domain words (bot, channel, mention, dm) are frozen.
