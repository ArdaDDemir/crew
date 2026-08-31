---
status: accepted; qualified by 0035; spawn details qualified by 0061
date: 2026-08-28
decision-makers: Arda
---

# Grok Person turns spawn the Grok CLI

## Context and Problem Statement

Slice A stored `BotRecord.harness` / `harnessModel` and listed Grok in Settings → Providers. Talk still went through OpenRouter (`ADR-0030`). Arda named **Grok spawn** as the first harness adapter. Crew must stay the office (mention wake, channel/DM JSONL, account). Grok CLI must do the desk work with its own tools.

## Decision Drivers

- Hexagonal core: no `child_process` in `packages/core`.
- Same `Provider.complete()` port (`ADR-0003`).
- One harness at a time (Grok first; Claude / Codex / OpenCode later).
- Jobs (title, compact, vision, read) stay OpenRouter.
- Unit tests never call the real `grok` binary or the network.
- Headless Grok cannot show its TTY permission prompts inside Crew.

## Considered Options

- Map Grok tools onto Crew `read` / `apply_patch` / `shell` and keep the Crew tool loop.
- ACP `grok agent stdio` (bidirectional).
- Headless `grok --prompt-file --output-format streaming-json --always-approve`.

## Decision Outcome

Chosen option: **headless Grok CLI as a `Provider` adapter.**

- New package `packages/provider-grok`. Implements `complete(req) -> AsyncIterable<ChatEvent>`. Spawn is injected; production uses `Bun.spawn`.
- Host selects it when the woken person has `harness: "grok"` **and** Settings → Providers → Grok is enabled. Missing/disabled Grok falls back to OpenRouter + `bot.model`.
- Invoke: `grok --prompt-file <tmp> --cwd <workspace> --output-format streaming-json --always-approve --verbatim --no-alt-screen --no-auto-update --max-turns 8` plus `-m <harnessModel>` when set. `--deny` for `.env` and `.ssh`.
- Parse NDJSON `text` → `text-delta`, `thought` → `reasoning-delta`, `error` → `error`. Ignore `tool_call` / `tool_call_update` so Crew does not execute Grok tools as Crew tools. Final `end` / exit 0 with no text is a done turn; non-zero exit without text is an error.
- Crew system (soul, channel rules/context, skills) rides in the prompt file. Grok keeps its own tool system (no `--system-prompt-override`). Prompt tells Grok to give a first-person English account; that text is what `runBotTurn` posts.
- Stop kills the child (`AbortSignal` on the host run).
- `--always-approve` because Crew cannot proxy Grok's permission UI. Crew's permission card still gates **Crew** tools on OpenRouter people.
- `dispatchChannelPost` / `dispatchDm` may bind a per-bot provider + model (`providerForBot`). `runBotTurn` honors `bindModel` over `bot.model`.

### Consequences

- Good, because `@coder` with Grok implementation actually runs `grok` and still accounts in the channel.
- Good, because core tests stay scripted; spawn is faked.
- Bad, because Grok turns skip Crew `apply_patch` / Always / supervised cards — Grok's `--always-approve` plus deny rules is the gate.
- Bad, because Claude / Codex / OpenCode still talk on OpenRouter until their adapters.

### Confirmation

`packages/provider-grok`, `apps/web/src/host.ts` `providerForBot`, `packages/core/src/dispatch.ts` `providerForBot`, `docs/specs/provider.md`, CHANGELOG `[Unreleased]`.
