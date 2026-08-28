---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# In-page snap panes

## Context and Problem Statement

Right-click **Open to the right / below** (`ADR-0026`) and Slack/Windows snap muscle need a second thread visible without leaving the office. The chat column is a singleton (`#log`, one composer). OS windows and Electron are out of product scope (`ADR-0017`).

## Decision Drivers

- Max two panes in v1. Not three-up, not floating OS windows.
- Mention routing and JSONL stay unchanged. Split is chrome.
- Jump, rail click, and streaming must target a known pane (`activePane` / `runPane`).
- English copy. Local UI only.

## Considered Options

- Electron / OS windows per thread.
- Unlimited tiled panes.
- In-page split: `#pane-0` + `#pane-1`, CSS grid, right-click + drag.

## Decision Outcome

Chosen option: **max two in-page panes, not OS windows.**

- `state.panes`, `state.split` (`none` | `right` | `below`), `state.activePane`.
- `splitOpen(kind, id, "right"|"below"|"replace")` and `paneOpen(index, kind, id)`.
- Right-click Open to the right / below; drag rail rows with MIME `application/x-crew-thread`.
- Ghosts `#drop-right` / `#drop-below`. Drop on the current pane replaces it.
- Jump and rail left-click open in `activePane`. NDJSON paints `state.runPane`.
- Close X on pane-1 returns to one pane. Restore `sessionStorage` `crew.split` after bootstrap if ids still exist.

### Consequences

- Good, because a channel and a DM can sit side by side without a new product surface.
- Good, because Task 2 menus already call `splitOpen` by name.
- Bad, because two composers and two logs must stay bound; a singleton `els` leak paints the wrong thread.
- Out of this ADR: slash, compact, Jobs, Electron, three panes.

### Confirmation

`apps/web/public/{index.html,app.css,app.js}` `#pane-0` `#pane-1` `splitOpen` `paneOpen`, `docs/specs/web-ui.md`.
