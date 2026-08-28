# Local web UI

Adapter: `apps/web`. Bun.serve on `127.0.0.1:7734` (`bun run ui`). Same `.crew` as `crew`. English copy. `ADR-0017`, `ADR-0020`, `ADR-0023`, `ADR-0024`, `ADR-0026`, `ADR-0027`, `ADR-0028`, `ADR-0029`, `ADR-0030`, `ADR-0031`, `ADR-0032`.

The browser never calls OpenRouter.

Sidecar / CLI flags (also `crew-server.exe`): `--cwd <dir>` `--port <n>` `--public <dir>` `--hostname 127.0.0.1`. Unknown dash flags throw. Hostname must be loopback. Compiled public dir is next to the exe, not `import.meta.dir`. Stdout: `crew ui  http://127.0.0.1:<port>`. Desktop window: `apps/desktop` (`bun run desktop`).

## HTTP

| Method | Path | What |
|---|---|---|
| GET | `/api/health` | `{ ok: true, version }` |
| GET | `/api/bootstrap` | `version`, `updateUrl`, channels, bots (`harness` / `harnessModel`), DMs, posted counts, allowed models, `providers`, `providerCards`, `defaultPermissionMode`, `autoCompact`, `reviewerModel`, `cwd` |
| GET | `/api/thread?kind&id` | messages / thinking / tools / shortened errors |
| POST | `/api/say` | NDJSON stream (`text`, `thinking`, `tool`, `ask`, `done`). Channel: `{ channelId, text }`. DM: `{ kind: "dm", id, text }` (`ADR-0041`) |
| POST | `/api/dm` | human or watch replay (`threadId` optional) |
| POST | `/api/dm/new` | extra chat with a person (`human__<bot>__t…`) |
| POST | `/api/stop` | halt in-flight dispatch |
| GET | `/api/watch` | SSE `{ posted, dms, botIds, channelIds }` |
| GET/PATCH/DELETE | `/api/channel/:id` | detail, update (incl. folders, mode), delete (JSONL stays) |
| GET/PATCH/DELETE | `/api/bot/:id` | detail, update, delete |
| POST | `/api/bots` `/api/channels` | create (reserved ids rejected) |
| GET/POST/DELETE | `/api/bot/:id/skills` `/…/:name` | SKILL.md body, upsert, rm |
| GET | `/api/diff?kind&id` | file-touch list; rows may include `snippet` (unified hunk from last `apply_patch` args on the JSONL event) |
| GET | `/api/paths?q=` | workspace-relative files `{ paths: string[] }` (depth ≤ 4, cap 50; never `.env` / `.ssh`) |
| GET/POST | `/api/permissions` | Always rules; POST `{ tool: apply_patch\|shell, path?\|command? }` adds a fingerprint |
| DELETE | `/api/permissions` | no query = clear all; `?tool=&key=` deletes one row |
| POST | `/api/permission` | `allow` \| `deny` \| `always` |
| GET | `/api/models?q=` | OpenRouter catalog search |
| POST | `/api/key` `/api/model` `/api/fallback` `/api/allowed-models` `/api/mode` `/api/base-url` `/api/default-mode` `/api/auto-compact` `/api/reviewer` `/api/update-url` `/api/update-check` | config. `update-url` writes `~/.crew/config.json` `updateUrl` (https; http on localhost). `update-check` `{ status: disabled\|current\|available\|error }` — no self-install. Relative download URLs resolve against the `latest.json` URL (`ADR-0039`, `ADR-0040`) |
| GET/PUT | `/api/providers` | `.crew/providers.json` `{ openrouter, claude, codex, grok, opencode }` each harness `{ enabled, binary, customModels: string[] }` |
| GET | `/api/providers/health` | `{ cards }` with `installed`, `version`, `status` (`ready`\|`installed`\|`missing`\|`off`), `login`. PATH + `--version` (3s). Also looks in `%USERPROFILE%\.local\bin` (native Claude), npm, WinGet Links, scoop shims. Does not block bootstrap. |
| GET | `/api/providers/models` | `{ openrouter, claude, codex, grok, opencode }` each `{ id, label }[]`. OpenRouter = whitelist. Harness lists: `customModels` first, then CLI (`grok models`, `opencode models`, Claude `--help` aliases, Codex `~/.codex/models_cache.json`) plus current fallbacks. Cached 60s; cleared on `PUT /api/providers`. |
| POST | `/api/attach` | write files under `inbox/` (no `..`, no `.env` / `.ssh`) |
| POST | `/api/compact` | `{ kind, id }` → `{ ok, summary, keptFrom, model }`. 400 if missing id or empty summary. Uses Jobs Compact implementation (`compact.model`, else workspace default). Optional `compact.botId` still wraps that person's Soul if present. Empty model = default. Appends `thread.summary`; JSONL not rewritten. Auto-compact honors `autoCompact` (off = only `/compact`) |
| GET | `/api/compact-status` | `?kind&id` → `{ posted, keep: 80, hasSummary, lastCompactAt }` |
| GET | `/api/jobs` | `{ title, compact, vision, read }` each `{ model, botId, harness, harnessModel }`. Missing file → empty models, nulls |
| GET/PUT | `/api/mcp` | `.crew/mcp.json` `{ servers: [{ name, enabled, command, args, env, url, headers }] }`. Stdio or HTTP. Max 8. Missing file → `[]` |
| GET | `/api/mcp/tools` | `{ tools: [{ name, description }] }` from live initialize + `tools/list`, plus `mcp_<server>_resources_*` / `_prompts_*` when advertised (`ADR-0038`). Dead servers skipped |
| PUT | `/api/jobs` | same shape. `botId` null or an existing bot (not reserved). `harness` null or `claude\|codex\|grok\|opencode`. 400 on bad id. Writes `.crew/jobs.json` (not `config.json`) |
| GET/PUT | `/api/dm-prefs` | `.crew/dm-prefs.json` `{ archived, deleted, modes }`. Deleted omitted from bootstrap `dms`; archived flagged. `modes[threadId]` is that DM's permission mode (`ADR-0041`). JSONL stays |
| POST | `/api/thread-title` | `{ kind, id }` appends `thread.titled` (last wins). Title job is not a channel wake |

`/clear` in the composer is a sessionStorage bookmark, not a JSONL truncate. Export downloads the current thread JSON.

## Office chrome

- App **top bar**: Crew brand, workspace path, Members toggle. Crew.exe also shows Open project and window min/max/close (frameless). Split: drag a chat from People onto **Drop beside**, or drag the grip on the right edge of the left chat. Ctrl+\\ splits, Ctrl+Shift+W closes. Double-click the top bar maximizes Crew.exe. The rail does not repeat the Crew wordmark.
- Rail: channels, people. Click a person to expand their human DMs (`ADR-0033`, qualifies `0025`): ~3 rows then scroll, newest first. `+` new chat. Pencil / trash on hover (always on touch). Archive / Delete via context menu (`.crew/dm-prefs.json`; JSONL stays). Direct is bot↔bot only. Drag a chat to the right half of the stage to open a second pane. Empty second pane: **Drop a chat here**.
- Chat: folds for thinking/tools, search, files chip, export, Stop, @ / palettes, composer + File / + Folder (saved under `inbox/`). Files modal: each path is a `<details>` row; `apply_patch` rows show the unified hunk in `<pre class="diff">` (no Accept/Reject).
- Composer: empty dock is `+` (bottom left) and **Send** (bottom right). `+` opens File / Folder. Enter sends (IME-safe); Shift+Enter newline. `@path` from disk. `/` command palette (UI only).
- Person/channel **Id** is a locked field. Person **Rooms** are editable only on create; after that, membership is the channel sheet.
- Desk: Discord-style `Members — N`, green/yellow dots, activity (`Thinking`, `Reading index.html`).
- Chat header `#work-chip` shows the same live activity (`Coder · Reading index.html`); hidden when idle. Plan-approve is a later JSONL event — no extra LLM call.
- Chat header `#context-chip` (pane-1 uses the class): `{posted}/{keep}` or `{posted}/{keep} · compacted` when a `thread.summary` exists. Updates on thread open and after compact. Auto-compact when posted > keep * 0.7, once per thread (`sessionStorage` `crew.autoCompact:{kind}:{id}`).
- New channel/person: full sheet, random locked slug, + File / + Folder.
- Settings tabs (T3-shaped): **General** (default/fallback, new-room mode, auto-compact), **Providers** (OpenRouter key/base URL/whitelist + Claude/Codex/Grok/OpenCode cards with custom models; replaces Models), **Jobs**, **MCP** (stdio or HTTP servers in `.crew/mcp.json`; tools, resources, and prompts on Crew-native turns), **Permissions** (Always add/remove + reviewer), **About** (version + workspace path + opt-in update URL and Check). Crew.exe × hides to tray (`ADR-0039`).
- **Implementation picker** (`ADR-0031`): search, left All + provider logos, right model list. Used for Person Model, General Default, and Jobs Title / Compact / Vision / Read. Groups are Crew providers, not OpenRouter vendors. OpenRouter = whitelist; a harness = that CLI's models + `customModels` when the card is enabled and installed. Picking a harness stores `harness` + `harnessModel`. Enabled Grok / Claude / Codex / OpenCode Person turns spawn that CLI (`ADR-0034`, `ADR-0035`). The menu is portaled into the open `<dialog>`; Settings tab switch closes it.
- Jobs: Title, Compact, Vision, and Read use that picker (not a person `<select>`). Empty Title/Compact = Default. Empty Vision/Read = Off. `botId` on disk still wraps Soul if set. Job runtime is OpenRouter `complete()` even if the slot stores a harness.
- Person sheet **Chat titles** picks that person's title model (empty = Jobs Title default). Title job wraps that person's Soul.
- Direct list title prefers latest `thread.titled`. First human post on a human DM runs the title job. Chat header **Regenerate title** is only on a human DM (`hidden` chips stay hidden: `.chip[hidden]`).
- Attach: image `png|jpg|jpeg|webp|gif` with a vision agent set captions in English; the human post prepends `[image inbox/x.png: CAPTION]` plus the `Attached:` path list. Vision Off or failure = path only.
- Icon dropdown. `?` on modal fields (hover after the pointer moves, not click and not on open-focus).
- Skills: list on Person; add/edit is its own sheet. Modal scrollbars match the dark theme.
- Sheet dialogs use `display: flex` only while `[open]`, so Cancel / Close hide them.
- Buttons: Save/Send/Allow green, Delete/Deny/Stop red, with icons.
- Phone: Menu drawer; desk hidden. Header chips go icon-only (search and export hide). Send stays in the composer.
- Ctrl/Cmd+K jump palette over channels, people, DMs. Jump opens in the **active pane**.
- Right-click a channel, person, DM row, or message → English context menu (Open, Open to the right, Open below, Copy id, Copy message, Pin in sessionStorage, Mark unread).
- Split panes: max two in-page columns (`#pane-0` `#pane-1`), not OS windows. Open to the right / below, or drag a rail row (`application/x-crew-thread`). Each pane has its own log and composer. X on pane-1 closes the split. One in-flight run at a time: submit or `/retry` from the other pane toasts `Wait for the current run to finish.` and does not POST `/api/say`. Sequential send after `done` is allowed.

## Composer slash

Palette in the composer (`/` + Enter). Same ids as the table. Not a CLI TUI.

| Command | What |
|---|---|
| `/help` | list commands (sheet `#slash-help`, one English line each) |
| `/clear` | hide older messages; JSONL stays |
| `/compact` | `POST /api/compact` `{ kind, id }` of the active pane. 200 toast `Compacted.` and refresh the context chip. 400/404 toast `Compact is not ready yet.` (no throw) |
| `/stop` | halt the in-flight run |
| `/mode` | permission mode sheet |
| `/model` | Settings (default model) |
| `/status` | toast: keep window (80 or bootstrap `keep`), posted count, last compact ts from `GET /api/compact-status` or `compacted: never` |
| `/diff` | files modal for this thread |
| `/export` | download current thread JSON |
| `/new` | new chat when the pane is a human DM; else toast `New chat is for Direct messages.` |
| `/retry` | resend last message |
| `/new-person` | create a bot |
| `/new-channel` | create a channel |
| `/settings` | Settings (General / Providers / Jobs / Permissions / About) |

## Out of this adapter

`crew serve` / multi-human remote: `docs/todos/multi-human-remote.md`. Electron, Discord API, plugin marketplace: later. Harness spawn is `ADR-0034` / `ADR-0035`. MCP is `ADR-0036`–`0038`. Desktop window is Tauri + WebView2 (`ADR-0032`); tray + opt-in updates `ADR-0039`. Not Electron.
