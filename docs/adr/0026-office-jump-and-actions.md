---
status: accepted; qualified by 0027
date: 2026-08-28
decision-makers: Arda
---

# Office jump palette and context actions

## Context and Problem Statement

The rail lists channels, people, and Direct chats; switching is a click. Slack muscle is **Ctrl/Cmd+K**. Discord muscle is **right-click** a room, person, DM, or message. Split panes (later, ADR-0027) need those actions to name a target without replacing the current thread yet.

## Decision Drivers

- Keyboard first: jump must work with hands on the keys.
- Jump is chrome, not a second router. Existing `openThread` / `openPersonDm` stay the open path.
- Sheets already use `<dialog>` top-layer; jump must not fight them.
- English copy. Local UI only (`ADR-0017`).
- JSONL stays append-only (`ADR-0004`). Pin in v1 is client-only.

## Considered Options

- In-thread `#search` as the only jump vs a Slack-style palette over rooms, people, and chats.
- Jump as a `<dialog>` vs a `div#jump` overlay.
- Context menus in a later ADR vs one ADR covering jump now and the menu contract for Task 2.

## Decision Outcome

Chosen option: **Slack-style jump overlay now; Discord-style context menus recorded here and implemented next.**

Jump:

- Overlay `#jump` is a `div`, not a `<dialog>`. `Ctrl+K` / `Cmd+K` opens; type filters; Enter opens in the **active pane**; Escape closes.
- Skip open when `document.querySelector("dialog[open]")` (sheets win). If jump is already open, the chord focuses `#jump-q`.
- Rows from `bootstrap.channels`, `bootstrap.bots`, `bootstrap.dms`. Filter is case-insensitive on `label`, `id`, `hint`.
- Channel → `openThread("channel", id)`. DM → `openThread("dm", id)`. Person → `openPersonDm(botId)` (that person’s latest human chat).

Context menus (Task 2 — decision now, no menu in this change):

- Right-click a channel, person, DM row, or message. Hide on click-outside, Escape, scroll.
- Items: **Open**, **Open to the right**, **Open below**, **Copy id**, **Copy message**, **Pin** (sessionStorage `crew.pins:{kind}:{id}`), **Mark unread**.
- Open to the right / below call `splitOpen(kind, id, "right"|"below")` (stub until ADR-0027). Must not throw.
- Pin does not rewrite JSONL. Optional later `message.pinned` append.

Panes, slash, compact, and Jobs are out of this ADR.

### Consequences

- Good, because Slack/Discord hands keep working without a new rail habit.
- Good, because jump reuses `openThread` / `openPersonDm`.
- Bad, because `#jump` is another overlay to freeze against sheets (`dialog[open]` skip).
- Bad, because sessionStorage Pin is per-tab and dies with the session.
- Later: plan-approve is a new JSONL event type (not this change). Until then, do not invent a silent extra LLM call. The header work chip is live activity only.

### Confirmation

`apps/web/public/{index.html,app.css,app.js}` `#jump` / `openJump` / `jumpItems`, `docs/specs/web-ui.md`. Context menu confirmation lands with Task 2 (`#ctx-menu` / `openMenu`).
