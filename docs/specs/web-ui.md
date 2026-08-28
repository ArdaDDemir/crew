# Local web UI

Adapter: `apps/web`. Bun.serve on `127.0.0.1:7734` (`bun run ui`). Same `.crew` as `crew`. English copy. `ADR-0017`, `ADR-0020`, `ADR-0023`, `ADR-0024`, `ADR-0026`, `ADR-0027`, `ADR-0028`, `ADR-0029`.

The browser never calls OpenRouter.

## HTTP

| Method | Path | What |
|---|---|---|
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/bootstrap` | channels, bots, DMs, posted counts, allowed models |
| GET | `/api/thread?kind&id` | messages / thinking / tools / shortened errors |
| POST | `/api/say` | NDJSON stream (`text`, `thinking`, `tool`, `ask`, `done`) |
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
| GET/DELETE | `/api/permissions` | Always rules; clear |
| POST | `/api/permission` | `allow` \| `deny` \| `always` |
| GET | `/api/models?q=` | OpenRouter catalog search |
| POST | `/api/key` `/api/model` `/api/fallback` `/api/allowed-models` `/api/mode` | config |
| POST | `/api/attach` | write files under `inbox/` (no `..`, no `.env` / `.ssh`) |
| POST | `/api/compact` | `{ kind, id }` → `{ ok, summary, keptFrom, model }`. 400 if missing id or empty summary. Compact job model from `.crew/jobs.json` `compact.model` if set, else workspace default. Optional `compact.botId` wraps the system prompt with that Soul. Appends `thread.summary`; JSONL not rewritten |
| GET | `/api/compact-status` | `?kind&id` → `{ posted, keep: 80, hasSummary, lastCompactAt }` |
| GET | `/api/jobs` | `{ title, compact, vision, read }` each `{ model, botId }`. Missing file → empty models, `botId` null |
| PUT | `/api/jobs` | same shape. `botId` null or an existing bot (not reserved). 400 on bad id. Writes `.crew/jobs.json` (not `config.json`) |
| POST | `/api/thread-title` | `{ kind, id }` appends `thread.titled` (last wins). Title job is not a channel wake |

`/clear` in the composer is a sessionStorage bookmark, not a JSONL truncate. Export downloads the current thread JSON.

## Office chrome

- Rail: channels, people, Direct grouped by person (`ADR-0025`). Each person has many chats (title + Today/Yesterday). `+` opens a new chat. People row opens the latest.
- Chat: folds for thinking/tools, search, files chip, export, Stop, @ / palettes, composer + File / + Folder (saved under `inbox/`). Files modal: each path is a `<details>` row; `apply_patch` rows show the unified hunk in `<pre class="diff">` (no Accept/Reject).
- Composer: Enter sends (IME-safe: skip `isComposing` / keyCode 229); Shift+Enter newline. `@path` mentions come from disk via `GET /api/paths` (bots first, then files). Picking a path inserts `@src/app.ts ` in the draft — no `inbox/` copy. Type `/` for the command palette (UI only, not `crew open`).
- Person/channel **Id** is a locked field. Person **Rooms** are editable only on create; after that, membership is the channel sheet.
- Desk: Discord-style `Members — N`, green/yellow dots, activity (`Thinking`, `Reading index.html`).
- Chat header `#work-chip` shows the same live activity (`Coder · Reading index.html`); hidden when idle. Plan-approve is a later JSONL event — no extra LLM call.
- Chat header `#context-chip` (pane-1 uses the class): `{posted}/{keep}` or `{posted}/{keep} · compacted` when a `thread.summary` exists. Updates on thread open and after compact. Auto-compact when posted > keep * 0.7, once per thread (`sessionStorage` `crew.autoCompact:{kind}:{id}`).
- New channel/person: full sheet, random locked slug, + File / + Folder.
- Settings: key, default/fallback, allowed chips, Jobs (title / compact / vision / read — model + person, not extra People), Always list, search catalog (2+ chars). Empty vision/read model = Off (skip). Empty title/compact = Default (workspace model).
- Direct list title prefers latest `thread.titled`. First human post on a human DM runs the title job. Chat header **Regenerate title** is only on a human DM (`hidden` chips stay hidden: `.chip[hidden]`).
- Attach: image `png|jpg|jpeg|webp|gif` with a vision model set captions in English; the human post prepends `[image inbox/x.png: CAPTION]` plus the `Attached:` path list. Vision Off or failure = path only.
- Icon dropdown. `?` on modal fields (hover after the pointer moves, not click and not on open-focus).
- Skills: list on Person; add/edit is its own sheet. Modal scrollbars match the dark theme.
- Sheet dialogs use `display: flex` only while `[open]`, so Cancel / Close hide them.
- Buttons: Save/Send/Allow green, Delete/Deny/Stop red, with icons.
- Phone: Menu drawer; desk hidden.
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
| `/settings` | OpenRouter and models |

## Out of this adapter

`crew serve` / multi-human remote: `docs/todos/multi-human-remote.md`. Electron, Discord API, MCP: not v1.
