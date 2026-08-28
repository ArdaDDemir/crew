# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
with a 0.x policy: breaking changes bump the **minor** number until 1.0.

See `docs/versioning.md`.

## [Unreleased]

## [0.3.0] - 2026-08-28

Office chrome: jump, menus, split panes, `@path`, slash, compact layers, Settings Jobs.

### Added

- Ctrl/Cmd+K jump palette over channels, people, and DMs (`ADR-0026`).
- Right-click context menu on channels, people, DMs, and messages (Open, Open to the right/below, copy, pin, mark unread).
- `@path` file mention from workspace (`GET /api/paths`); picking a path leaves `@src/app.ts` in the draft (no inbox copy).
- Composer Enter IME guard (`isComposing` / keyCode 229); Shift+Enter still newline.
- Composer `+ File` / `+ Folder` (and drag-drop). Files land in `inbox/` and are listed on the message.
- `ADR-0023` office sheet chrome (hover help, skill sheet, closed dialogs).
- `ADR-0024` composer attach (`inbox/`), locked ids, Rooms create-only, green/red buttons.
- Several DMs with the same person (`ADR-0025`). Direct groups by person; `+` opens a new chat.
- Files chip shows a readable diff hunk from `apply_patch` args.
- Header shows who is working, like Discord activity in the chat.
- In-page split panes (Open to the right / below, drag from the rail; max two).
- Composer `/` palette: `/help` `/clear` `/compact` `/stop` `/mode` `/model` `/status` `/diff` `/export` `/new` (office `/retry` `/new-person` `/new-channel` `/settings` stay).
- LLM compact: `POST /api/compact` appends `thread.summary`; JSONL stays (`ADR-0028`). `/compact` toasts `Compacted.` Header `#context-chip` shows `{posted}/80` (and `compacted` after a summary). Auto-compact once when posted > 56.
- Settings Jobs (title, compact, vision, read) in `.crew/jobs.json` — not People (`ADR-0029`). `GET`/`PUT /api/jobs`. First human DM post appends `thread.titled`; Direct list uses it. **Regenerate title** in the chat header. Vision captions attached images when a model is set.

### Fixed

- Split pane: submit (and `/retry`) from the idle pane while the other is streaming toasts `Wait for the current run to finish.` and does not POST `/api/say`. Sequential send after `done` still works.
- Re-compact (`summarizeThread`) feeds the previous `thread.summary` as `[previous summary]` before the last 40 posted so a second compact keeps earlier intent. JSONL stays append-only.
- `.chip[hidden]` / `.danger[hidden]` honor the `hidden` attribute (Regenerate title and Stop no longer show on channels).

### Changed

- Modal `?` help is hover (and keyboard focus), not click.
- Modal `?` no longer opens on first paint (open-focus / leftover cursor).
- Skill add/edit is its own sheet; Person only lists skills.
- Modal (and other) scrollbars match the dark theme.
- Cancel / Close actually hide sheet modals (`display: flex` no longer overrides closed dialogs).
- Person/channel Id is a locked field. Person Rooms cannot be toggled on edit.
- Action buttons have color (Save green, Delete red) and icons.

## [0.2.0] - 2026-08-27

Office release: local web UI is a real adapter, skills are SKILL.md, Always persists, history windows.

### Added

- Local office UI (`bun run ui`): Discord-style members + activity, search, files chip, export, `/clear`, Stop, @ / palettes, icon dropdown, `?` help, random locked ids, + File / + Folder, full create sheets (`ADR-0017`, `ADR-0020`).
- `GET /api/watch` SSE so an idle tab sees CLI / other-tab posts.
- Skills: Agent Skills `SKILL.md` (slug + frontmatter + body) in prompt, UI edit/delete, `crew skill rm` (`ADR-0021`).
- Persistent Always in `.crew/permissions.json`; Settings lists/clears (`ADR-0018`).
- Prompt history window of 80; `thread.compacted` appended, JSONL not rewritten (`ADR-0019`).
- Org tools `bot_create`, `channel_create`, `self_update`, `skill_acquire` (`ADR-0022`). Caps 16. Reserved ids `human` / `you` / `everyone` / `engine`.
- Workspace `removeBot` / `removeChannel` (logs stay).
- CLI: `bot update` / `show`, `--soul FILE`, `skill list|show|add|copy|rm`, `/stop`, `config set fallback|allowed`.
- Settings: OpenRouter key, default/fallback, allowed whitelist, search catalog (2+ chars). Rail does not show the model id.

### Fixed

- Modal Close / Cancel / backdrop actually close the dialog.
- Replay no longer leaves everyone “working”; activity is `Thinking` / `Reading index.html` / `Online`.
- Phone: Menu drawer; desk hidden.
- Old 429 JSON in the thread is shortened (no `user_id`).
- Files chip: paths, not `cat` dumps.
- Channel/bot PATCH no longer wipes omitted fields (`memberBotIds: undefined`).
- Settings/Person: one sheet scrollbar; catalog is compact search rows.

## [0.1.0] - 2026-08-27

First cut: hexagonal core, CLI, JSONL, OpenRouter, first local UI.

### Added

- Hexagonal core + JSONL + FsWorkspace. CLI `crew`: bot/channel/say/dm/dms/open/mode/log/config.
- Mention routing, one turn per bot per `say`, human-tagged stop (`ADR-0013`, `ADR-0014`).
- Desk then account (`ADR-0012`). Tools `read`, `apply_patch`, `list_dir`, `shell`. Four permission modes; auto-accept includes workspace shell.
- `dm_send`; human can read every DM (`ADR-0015`). Latest human wins (`ADR-0016`).
- OpenRouter OpenAI-compatible adapter. Default model `z-ai/glm-5.3-flash`.
- ADRs, specs, 0.x versioning. `AGENTS.md` is law (`ADR-0010`).
- First `apps/web` adapter: channel log, DMs, composer, mode (`ADR-0017`).

### Fixed

- OpenAI adapter `tool_calls` shape; Z.AI `Inference processing failed` retries once without tools.
- `@` inside a URL path is not a wake.
- `apply_patch` with empty `old_text` does not overwrite an existing file.
