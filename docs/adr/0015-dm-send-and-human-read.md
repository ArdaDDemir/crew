---
status: accepted; many chats per person → ADR-0025
date: 2026-08-27
decision-makers: Arda
---

# Bots DM via `dm_send`; human can list and read every DM

## Context and Problem Statement

Spec already said bots may DM and the human may read all DMs. The engine had `crew dm` (human-driven) but no tool for a bot in a channel turn to open a DM. There was no `crew dms` list. Desk work was already in JSONL (`assistant.reasoning`, `tool.*`) for a later UI.

## Decision Outcome

- Channel turns get `dm_send` (`to`, `text`) targeting a **channel member**. Always allowed (talk, not filesystem).
- The engine posts the DM, then the other bot takes **one** DM turn (no nested `dm_send` — one hop).
- Human: `crew dms` lists threads; `crew dms show a b` reprints that JSONL. `--thinking` / `--verbose` still show desk work in that thread.
- Channel `@` stop rules (`ADR-0013`/`0014`) do not apply inside a DM; DMs do not wake a channel.

Desk for the UI: same events, same files. CLI does not dump them on `say`.

### Confirmation

`dispatch.ts` (`sendDm` + pending DMs), `crew dms`, `EventStore.listThreads`.
