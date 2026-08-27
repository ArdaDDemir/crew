---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# Bots, channels, mentions, DMs

## Context and Problem Statement

The product is a local Grok Bot: a human creates bots and channels, a lead assigns work with `@`, bots may run in parallel or wait, and bots may DM each other. A single ChatGPT-shaped session cannot express this.

## Considered Options

- One agent, tools only (Claude Code v1)
- Discord as the only UI
- First-class Bot, Channel, Mention, DM in core (CLI is the first client)

## Decision Outcome

Chosen option: "First-class Bot / Channel / Mention / DM in core".

Rules:

- A **bot** is a named persistent teammate (soul, skills, tool allowlist).
- A **channel** is created by the human. The human picks members and an optional lead. The channel has its own rules and context, same idea as a bot soul.
- **Mention = wake.** Only `@mentioned` bots take a turn on that message. Unmentioned bots wait.
- Several `@` in one message → those bots may run **in parallel**.
- A bot may `@` another bot in a channel message (public handoff) or **DM** another bot (private handoff).
- The human can read every DM (this machine is theirs).
- If the human posts in a channel with no `@`, the **lead** (if set) takes the turn. If there is no lead, no bot speaks.

Lead is not a special engine type. It is a bot flagged as `lead` on that channel.

### Consequences

- Good, because the GUI later is a renderer of the same rooms
- Bad, because one channel can have several in-flight turns (not Codex’s single Task)

### Confirmation

`docs/specs/bots-and-channels.md` and `docs/specs/mentions-and-routing.md`. Domain tests cover mention fan-out before any LLM adapter exists.
