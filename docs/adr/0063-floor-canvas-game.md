---
status: accepted
date: 2026-08-31
decision-makers: Arda
---

# The floor is a canvas-rendered game scene

## Context and Problem Statement

The 2.5D floor (`ADR-0056`–`0060`) was CSS `div`s: skewed boxes for walls, blob characters, no animations, no speech. Arda asked for a **real game feel** — "you are talking with your team" — walking, typing, accounts as speech bubbles, pan and zoom. CSS could not carry that.

## Decision Outcome

Qualifies `ADR-0056`–`0060`. All data contracts stay: `looks.json` (skin/hair/top), `floor.json` (furniture as `{id, kind, x, y}` CSS-px multiples of 8 — the canvas converts to tiles by `/8`), presence/activity feed, DM-on-person-click, doors-switch-channel, owner furniture kit. Mention routing, desks, accounts: untouched.

1. **Rendering is canvas.** `apps/web/public/floor-game.js` draws the room with 2D canvas: isometric checker floor, walls + window, doors with `#sign`s on the back wall, a glass meeting table, desks with monitors (lit when busy), procedural pixel characters (skin/hair/top from `looks.json`, 4-frame walk, sit/type poses), shadows, name tags, and **speech bubbles that type out the live account** while a bot works; a status dot colors the pose (thinking / working / writing).
2. **Layout + pathing are pure.** `apps/web/public/floor-iso.js` exports the isometric projection, desk/table/door slots, a stable desk assignment (sorted by id), and BFS pathing around desks/furniture. Unit-tested with bun — no DOM.
3. **Input**: click carpet → pathed walk; click a person → DM; click a door → enter that channel; click furniture (no hold) → owner removes it; kit hold + click → place. Drag pans, wheel zooms, Esc cancels a hold. In the desktop shell nothing changes — same canvas.
4. **The old CSS scene is gone**: `floor-layout.js` and its test are deleted; `app.js` keeps thin adapters (`renderFloor`, `renderFloorDoors`, furniture + hint + kit) that feed the engine `setState`.

Not this ADR: multiplayer cursors, sound, day/night cycle, sprites from real art assets.

### Confirmation

TDD: `floor-iso.test.ts` (projection roundtrip, unique desk slots, pathing around obstacles, stable assignment); office page asserts `#floor-canvas` + engine modules served. Visual: run `bun run ui`.
