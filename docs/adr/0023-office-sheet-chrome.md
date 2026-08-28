---
status: accepted; attach / locked ids / button color → ADR-0024
date: 2026-08-27
decision-makers: Arda
---

# Office sheets: hover help, skill editor, closed dialogs

## Context and Problem Statement

`ADR-0020` made the local UI a live office. After that, three chrome bugs kept showing up as product bugs:

- `?` next to a field toggled a bubble on **click**, so people thought the control was broken.
- Skill add/edit (name, description, SKILL.md body, preview) lived inside the Person sheet and felt like one cramped form.
- Sheet CSS set `display: flex` on `dialog.modal.sheet` even when closed. `dialog.close()` dropped `[open]`, but the panel stayed on screen. Cancel / Close looked dead.

## Decision Drivers

- Field help is orientation, not a mode.
- SKILL.md is a file, not three extra Person inputs.
- A closed `<dialog>` must be `display: none`. Native `close()` is the API; CSS must not fight it.

## Considered Options

- Click-toggle help vs hover / keyboard focus tooltip in the top layer (popover).
- Keep the skill editor in Person vs a second sheet on top of Person.
- Force `display: flex` on every sheet vs `display: flex` only while `[open]`.

## Decision Outcome

Chosen option: hover help, skill as its own sheet, `[open]` owns `display`.

- `?` on modal fields: hover and `:focus-visible`. Tooltip is a `popover` so overflow on the sheet cannot clip it. Click does not insert a bubble into the form.
- Person lists skills (`+ Add skill`, click a card to edit). Add/edit is `#skill-modal`. New person: save first, then add skills (the bot must exist on disk).
- `.modal.sheet[open] { display: flex }`. `dialog.modal:not([open]) { display: none }`. Cancel / Close / backdrop / Escape call `close()`.
- Scrollbars: `color-scheme: dark` and thin thumbs (`#2a2a2e`). No OS-white gutter on sheets.

Icon dropdown, random locked slugs, + File / + Folder stay as in `ADR-0020`.

### Consequences

- Good, because Cancel/Close match what `close()` already did.
- Good, because SKILL.md has a real editor without lengthening Person.
- Bad, because two stacked `<dialog>`s (Person + Skill) is a Chromium top-layer trick; if a browser drops the parent, Skill Cancel must not strand Person closed.

### Confirmation

`apps/web/public/{index.html,app.css,app.js}`, `docs/specs/web-ui.md`. Closed-dialog CSS: `.modal.sheet[open]`, `dialog.modal:not([open])`.
