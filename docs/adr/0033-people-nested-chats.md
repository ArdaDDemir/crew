---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# Human DMs nest under People, not a flat Direct dump

## Context and Problem Statement

`ADR-0025` grouped Direct by person, then listed every chat under a second **Direct** rail. Clicking a People row (with an unread **5**) jumped to the latest chat. All threads stayed visible at once. Archive/delete were missing. Drag-and-drop split often failed because the custom MIME type is invisible during `dragover` in WebView2.

## Decision Drivers

- Click the person to **expand chats**, not skip to the latest.
- A few rows visible (about three), the rest scroll, newest first.
- Hide/archive without rewriting JSONL.
- Two chats at once via drag onto the right half of the stage.

## Decision Outcome

Chosen option: **chats live under People; Direct is bot↔bot only.**

- People row toggles an accordion. `+` starts a new chat. Rows sort by last post.
- `.crew/dm-prefs.json` `{ archived, deleted }`. Delete hides from the rail; the JSONL file stays (`ADR-0004`). Archive is reversible under **Archived**.
- `GET`/`PUT /api/dm-prefs`. Bootstrap omits deleted ids and flags `archived`.
- Drag sets `text/plain` plus a same-window flag so WebView2 can split.
- Members stays a top-bar toggle (persisted).

Qualifies **0025** (Direct dump of human chats).

### Confirmation

`apps/web/src/dm-prefs.ts`, `#people .person-block`, `docs/specs/web-ui.md`.
