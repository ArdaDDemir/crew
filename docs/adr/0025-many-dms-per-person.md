---
status: accepted; qualified by 0033
date: 2026-08-27
decision-makers: Arda
---

# Several private chats with the same person

## Context and Problem Statement

One JSONL per pair (`human__coder`) mixed every job into a single DM. ChatGPT/Claude keep a **flat** conversation list (newest first, date stamps). Discord keeps **one** DM per person. Crew is an office of named people: grouping by person, then chats, matches how the human already thinks. Dates belong on the chat row, not as a second product.

## Decision Drivers

- One job should not pollute the next.
- Direct must stay scannable (not a second People list).
- Old `human__coder` files keep working.
- JSONL stays append-only (`ADR-0004`). Bot↔bot `dm_send` stays one hop on the pair thread (`ADR-0015`).

## Considered Options

- Flat ChatGPT-style list of all chats (no person grouping).
- Discord: still one DM per person.
- Group by person; each chat is its own thread; date on the row; `+` opens a new chat.

## Decision Outcome

Chosen option: **group Direct by person; many threads per pair**.

- Default / first chat stays `human__<bot>` (legacy file).
- Extra chats: `human__<bot>__<t…>` (slug). Same pair, new JSONL.
- Title = first `message.posted` gist, else `New chat`. Sort by last post, newest first.
- Direct rail: person header + `+`; chats under it with a relative date (`Today` / `Yesterday` / `12 Aug`).
- People row opens that person’s **latest** human chat (creates `human__<bot>` if none).
- `POST /api/dm/new { to }` opens an extra thread. `POST /api/dm` may send `threadId`.
- Bot↔bot stays `a__b` (no extra convs in this slice).

### Consequences

- Good, because a landing-copy chat and a CSS chat with Coder do not share history.
- Good, because `human__coder.jsonl` does not move.
- Bad, because latest-human-wins (`ADR-0016`) still sees **all** human DMs to that bot. A new chat does not hide an old order.

### Confirmation

`packages/core/src/events.ts` `parseDmThreadId`, `postToDm({ threadId })`, `POST /api/dm/new`, `docs/specs/web-ui.md`.
