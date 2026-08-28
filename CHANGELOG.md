# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
with a 0.x policy: breaking changes bump the **minor** number until 1.0.

See `docs/versioning.md`.

## [Unreleased]

## [0.7.0] - 2026-08-28

Honesty pack Wave A (`ADR-0043`) and Wave B/C (`ADR-0044`). MCP initialize reports the package version. CLI `woke:` prints before live accounts.

### Changed

- Settings **Jobs** pickers are OpenRouter-only. Leftover `harness` / `harnessModel` in `.crew/jobs.json` is ignored; resolve uses the OpenRouter model or the workspace default.
- `auto` reviewer accepts only `ALLOW` / `DENY` / `ASK`. `YES` and empty replies ask the human. Prompt: ALLOW only if in-workspace, reversible, on-task.
- Channel turns get an unread-DM count + newest gist, not every DM id. A DM is unread only if its last human post is after this bot's last channel account.

### Fixed

- `@` inside fenced or inline code is not a wake. URL `/@user` skip stays.
- `list_dir` hides `.crew`, `.git`, `.ssh`, `.env`, and `.env.*`.
- If a model ran tools and posted no account, the engine writes `I stopped after N tool call(s) without a channel account.`
- Stop on a harness spawn kills the process, then Windows `taskkill /PID /T /F` so grandchildren do not stay alive.
- `mcp_*` tools are not auto-accept shell; they ask (`ADR-0044`).
- Shell `type .env`, `.ssh`, `rm -rf /`, `irm`, and `curl | iex` are denied in every mode, reviewer skipped.
- Shell `>` / `>>` and `git` share the `apply_patch` in-process lock. `old_text not found` tells the model to re-read.
- `crew say` prints `woke:` before streamed accounts (was after).
- MCP `initialize` `clientInfo.version` follows `package.json` instead of a stale `0.6.0`.

## [0.6.0] - 2026-08-28

`latest.json`, DM permission mode, auto reviewer, `crew mode` on DMs.

### Added

- **`dist/latest.json`** (`ADR-0040`): `bun run desktop:build` writes `{ version, notes, url, platforms }` next to the installers. Relative `url` in that file is resolved against the hosted `latest.json` path. Optional `CREW_RELEASE_BASE` prefixes GitHub-style absolute URLs. Still no silent install.
- `GET /api/health` includes `version`.
- **DM permission mode** (`ADR-0041`): new Direct chats use Settings **New room mode**. Mode chip, Shift+Tab, and `/mode` work on a DM. Stored in `.crew/dm-prefs.json` `modes`. Legacy DMs without a row stay auto-accept. DM send streams through `POST /api/say` so supervised can show Allow/Deny cards.
- **`auto` reviewer** (`ADR-0042`): Settings → Permissions **Reviewer model** is actually used. `auto` rooms one-shot that model (`ALLOW` / `DENY` / else ask the human). Empty reviewer still falls back to supervised. Same bind on `crew say`.
- `crew mode <dmId>` sets a Direct thread’s mode in `.crew/dm-prefs.json` (`ADR-0041`).

## [0.5.0] - 2026-08-28

MCP resources/prompts, Windows MSI, opt-in update check, Crew.exe tray.

### Added

- **MCP resources and prompts** (`ADR-0038`): when a server advertises them on initialize, Crew-native turns also get `mcp_<server>_resources_list` / `_resources_read` (`uri`) and `mcp_<server>_prompts_list` / `_prompts_get` (`name` plus extra args). `tools/list` failure no longer drops a resources-only server.
- **Windows MSI** on `bun run desktop:build`: copies `dist/crew-windows-msi/`. NSIS still `dist/crew-windows-nsis/`. Tauri can download WiX/NSIS into the build cache. Portable `dist/crew-windows/` always.
- **Opt-in updates** (`ADR-0039`): Settings → About stores an HTTPS `updateUrl` in `~/.crew/config.json` (`CREW_UPDATE_URL` overrides). **Check for updates** fetches `{ version, notes, url }` (or Tauri `platforms.windows-x86_64`). Crew never overwrites itself; Download opens the URL. Empty URL = disabled. http only on localhost.
- **Crew.exe tray** (`ADR-0039`): × / Close hides to the notification area. Tray menu: Show Crew, Open project, Quit (stops the sidecar). Left-click restores.

## [0.4.0] - 2026-08-28

Crew.exe, Providers picker, harness spawn, MCP, CLI parity, harness permission map, Windows NSIS.

### Added

- **MCP tab** (`ADR-0036`, `ADR-0037`): Settings → MCP lists stdio **or HTTP** servers in `.crew/mcp.json` (env KEY=value, URL). Tools attach to Crew-native turns as `mcp_<server>_<tool>`. Enabled servers are written to `.crew/harness-mcp.json` and passed as `--mcp-config` on Grok/Claude. Dead servers are skipped. Not a plugin marketplace.
- **Harness spawn** (`ADR-0034`, `ADR-0035`, `ADR-0037`): enabled Grok / Claude / Codex / OpenCode Person turns spawn that CLI. **`crew say` / `crew dm` use the same bind.** Supervised does **not** spawn (Crew cards). auto-accept → `acceptEdits` / workspace-write. full-access → bypass/always-approve. `.env` / `.ssh` denied on every CLI. Jobs stay OpenRouter.
- **Crew.exe** desktop shell (`ADR-0032`, `ADR-0037`): native WebView2 window. Portable `dist/crew-windows/`. `bun run desktop:build` also tries a **NSIS** installer into `dist/crew-windows-nsis/` (needs NSIS on PATH). No auto-update, no macOS/Linux bundle.
- Office **custom top bar**: Crew + project path, **Members** toggle, desktop window buttons and Open project when running as Crew.exe. Split by dragging the handle on the **right edge of the left chat** (no split buttons). Drop a chat into the empty pane. Ctrl+\\ still splits; Ctrl+Shift+W closes the extra pane.
- People accordion (`ADR-0033`): click a person to expand their chats (about three visible, rest scroll, newest first). `+` new chat. Right-click a chat to Archive or Delete (log stays). Direct lists only bot↔bot. Drag a chat onto the right half of the stage to open a second pane.
- Settings → **Providers** (replaces Models): OpenRouter card (key, base URL, whitelist + catalog) plus Claude / Codex / Grok / OpenCode cards. Enable, optional binary path, **custom model** ids. Stored in `.crew/providers.json` so a config PATCH cannot wipe it (`ADR-0030`).
- `GET` / `PUT /api/providers`. `GET /api/providers/health` (PATH + `--version`, extra dirs for native Claude / npm / WinGet / scoop). `GET /api/providers/models` (OpenRouter whitelist; harness CLI lists + cache + custom; 60s cache).
- Person `harness` / `harnessModel` on `bot.json`. General default can store `defaultHarness` / `defaultHarnessModel`.
- Grouped searchable implementation picker (All + provider logos) on Person Model, Settings Default, and Jobs Title / Compact / Vision / Read (`ADR-0031`).
- Settings Permissions: Always **Add** (`POST /api/permissions` tool + path/command) and per-row Remove (`DELETE /api/permissions?tool=&key=`). Clear all stays.
- General: new-room permission mode (`defaultPermissionMode`), auto-compact on/off.
- Permissions: reviewer model (empty = `auto` still falls back to supervised).
- About: workspace path (`cwd`).
- Jobs slots persist `harness` / `harnessModel` next to `model` / `botId`.

### Changed

- Docs match the Unreleased office: README / `docs/README.md` / specs no longer say “MCP later” or “spawn later”. Snapshot + gaps: `docs/todos/now.md`.
- Office chrome polish: one Crew wordmark (top bar only), People edit/delete on hover, chat header grid, green Send, stronger empty split pane, icon-only header chips when split or on a phone.
- Settings tabs: General, Providers, Jobs, **MCP**, Permissions, About (`ADR-0030`, `ADR-0036`).
- Jobs Title, Compact, Vision, and Read use the **same** implementation picker as Default model. Empty Title/Compact = Default. Empty Vision/Read = Off. Compact/Vision/Read no longer pick a rail person (`ADR-0031`). Person **Chat titles** is still that person's title model (empty = Jobs Title).
- Composer: `+` bottom-left (file/folder menu), Send bottom-right. Empty dock stays empty besides those.

### Fixed

- Implementation picker painted behind the Settings `<dialog>` top layer or clipped by sheet overflow; the menu now lives inside the open dialog. Switching tabs closes it. Native `<select>` no longer shows a second “Default”.
- Claude “Not installed” when the binary is `%USERPROFILE%\.local\bin\claude.exe` and that folder is not on PATH.
- Codex / Claude picker lists were `--help` leftovers; Codex reads `~/.codex/models_cache.json`, Claude lists current aliases (4.6 / Fable 5).

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
