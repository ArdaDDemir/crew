---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# Office attach, locked ids, semantic buttons

## Context and Problem Statement

`ADR-0023` fixed sheet help, the skill editor, and closed dialogs. Three office gaps remained:

- Chat had no way to hand a file to the bots. Channel sheets had + File / + Folder; the composer did not.
- Person/channel **Id** looked like it might be editable (it is a slug). Person **Rooms** on edit let you change membership in two places.
- Every action button was the same grey ghost. Delete and Save did not read as different acts.

## Decision Drivers

- Bots read disk. Attach must become a path in the workspace, not a blob in the browser.
- `@id` / `#id` never change. Membership is a channel fact.
- Color is meaning: go vs stop.

## Considered Options

- Attach as a data URL in the message vs write under `inbox/` and list paths on the post.
- Editable id on create vs random locked slug on create **and** edit.
- Person Rooms always editable vs create-only (edit on the channel).

## Decision Outcome

Chosen option: `inbox/` attach, locked ids, Rooms create-only, green go / red stop.

- Composer `+ File` / `+ Folder` and drag-drop. `POST /api/attach` writes under `cwd/inbox/`. No `..`, no `.env` / `.ssh`. The human post lists the paths (`Attached: - inbox/…`). Max 32 files, 8 MiB each.
- Id field is `readonly` (`#landing`, `@coder`). Random slug on create. PATCH never renames.
- Person Rooms: toggles on **create** only. Edit shows the list and “Membership is edited on the channel.”
- Save / Send / Allow / + : `--go` green. Delete / Deny / Stop / Clear always: `--stop` red. Icons from an SVG sprite (`#i-check`, `#i-trash`, …).

`ADR-0023` still owns hover `?`, skill sheet, `[open]` display, dark scrollbars.

### Consequences

- Good, because bots `read` attached files like any other path.
- Good, because `@coder` stays `@coder` after a rename of the display name.
- Bad, because `inbox/` is another shared folder in cwd (same as any other file race).
- Bad, because the browser file picker does not give a workspace path — picked files are copies under `inbox/`, not the original disk location.

### Confirmation

`apps/web/src/host.ts` `attachFiles`, `POST /api/attach`, `apps/web/public/{index.html,app.css,app.js}`, `docs/specs/web-ui.md`.
