---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# Latest human message to a bot wins across channel and DM

## Context and Problem Statement

Channel history and DM history were isolated. Live: human DMed “do not touch index.html”; then `say` “set title to FlowHub”; coder followed the channel and patched. Same person, two brains.

Full merge of every DM into the channel is wrong (other bots would see private notes; tokens explode). Full isolation is also wrong (conflicting human orders).

## Decision Outcome

Hybrid (`docs/specs/edge-cases.md`):

- `@id` is one person. Disk is truth.
- Bot↔bot DMs stay out of the channel.
- Human messages to that bot across **their** channel membership and **human↔bot** DMs are ordered by `ts`. The latest wins if they conflict. The bot must say so.
- A channel turn gets a **pointer** that DMs exist, plus a gist of the latest other-thread human order — not a dump.
- A DM turn gets the bot’s last channel account line.

Injected as a trailing user note on the turn (`buildCrossThreadNote`), not by merging JSONL threads.

### Confirmation

`packages/core/src/orders.ts`, `orders.test.ts`, `turn.ts`.
