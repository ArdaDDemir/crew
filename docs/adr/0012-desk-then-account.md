---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# Engine-enforced desk work, then channel account

## Context and Problem Statement

Coworker UX is: get the job, work at your desk, then give an account in chat. Prompting that is not enough. The model often emits mutter (`checking files`) in the same round as a tool call. The CLI treated every `text-delta` as the channel bubble, so desk noise looked like chat.

Industry pattern (Anthropic multi-agent, Claude Code / Cursor subagents): workers keep a private transcript; the parent / room only gets a summary. We already isolate per-bot history. We were still leaking the transcript into the room.

Async background jobs (Cursor Cloud Agents) match "people at their desks" even more, but they need a job queue, presence, and a non-blocking `say`. Out of v1. Sync waves stay.

## Decision Drivers

- Channel = standup. Tools + thinking = desk.
- Engine enforces it. Prompt is a hint.
- No extra model round unless they already used tools.
- Keep mention-wake parallel; do not add an orchestrator-worker rewrite.

## Considered Options

- Prompt-only ("talk like a teammate")
- Buffer `text-delta` until the round has no tool calls; that text is the account. After tools, nudge once: give an account.
- Async desk jobs: `say` returns after wake; account arrives later

## Decision Outcome

Chosen option: "Buffer until no tools, then account; one post-tool nudge", because it is the smallest change that actually stops desk mutter from becoming chat, and it matches how subagents return summaries.

- Round with tool calls → desk. `text-delta` is stored as `assistant.delta`, not forwarded as channel text, not posted.
- Round with no tool calls → account. Forward `text-delta`, `dispatch` posts `message.posted`.
- After at least one tool round, inject one user nudge asking for a first-person account.
- Live `done` fires once per turn, after the account (or error).

### Consequences

- Good, because `say` prints only the account (`bak şunu yaptım`), not `checking…`
- Good, because `crew log` was already chat-only; live now matches log
- Bad, because the account appears as a burst after that round finishes, not token-by-token. That is closer to a person speaking than a chatbot dump.
- Bad, because a bot can still skip tools on round 1 and "account" without working. Prompt still has to cover that. We do not force `tool_choice=required`.

### Confirmation

`packages/core/src/turn.ts`, `turn.test.ts` (desk text not forwarded; nudge after tools), CLI `say` tests.
