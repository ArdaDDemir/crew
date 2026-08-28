# Office familiar UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the **web office** feel like Discord/Slack for rooms and like T3/Claude/Codex in the composer, plus split panes, visible compact, and Settings **Jobs** (which model titles / compact / vision).

**Architecture:** Core stays hexagonal. Product surface is **`bun run ui` only**. `crew` CLI stays for tests/scripts — do not build a TUI (`docs/todos/cli-is-script.md`). Compact is three layers (window, trim, LLM summary) append-only. Jobs are workspace slots (`model` + optional `botId`), not extra People. Split panes are in-page, max two. Computer-use and in-app browser parked.

**Tech Stack:** Bun, TypeScript, `apps/web` static `public/{index.html,app.css,app.js}`, existing `dialog` sheets, SVG sprite, JSONL append-only.

## Global Constraints

- Law: `AGENTS.md`. UI copy English. TDD. Architecture change → next ADR (`docs/adr/README.md`, after 0025). User-visible → `CHANGELOG.md` `[Unreleased]`.
- Do **not** build: Electron, Discord API, MCP, git-PR, `crew serve` (`docs/todos/multi-human-remote.md`).
- Parked until Arda asks: **computer-use** and **in-app browser** (`docs/todos/computer-use-and-browser.md`).
- CLI is not a product: no new `crew open` slash TUI. New controls = UI. Tests may still call `crew say`.
- JSONL is append-only. Do not rewrite logs. Id slugs stay locked (`ADR-0024`).
- One turn per bot per `say` (`ADR-0013`/`0014`) stays. Split panes do not create extra wakes.
- Familiarity sources: Discord/Slack (office), T3/Claude/Codex (composer + work). Crew is an **office**, not an IDE.

## Product shape (read this first)

```
┌──────── rail ────────┬──────── pane A (thread) ─────┬── pane B (optional) ──┐
│ Channels             │ header + search + files      │ same chrome           │
│ People               │ log (thinking/tools folds)   │                       │
│ Direct (by person)   │ composer: @ / / / files/mode │ own composer          │
└──────────────────────┴──────────────────────────────┴───────────────────────┘
```

- **Right-click** a channel, person, DM, or message → context menu (Discord).
- **Drag** a rail item onto the stage (or onto the other pane) → split like Windows Snap: **side by side** or **stacked**.
- Each pane is a full thread (channel or DM) with its own composer.

## Out of this program (parked)

| Item | Where |
|---|---|
| `crew serve` / multi-human | `docs/todos/multi-human-remote.md` |
| Computer-use + in-app browser | `docs/todos/computer-use-and-browser.md` |
| CLI as TUI product | `docs/todos/cli-is-script.md` |
| MCP, Electron, Discord Gateway, git auto-PR | `AGENTS.md` |

## File map

| File | Role |
|---|---|
| `apps/web/public/index.html` | Jump overlay, context menu, split stage, plan card host |
| `apps/web/public/app.css` | Menu, jump, split handles, diff, plan card |
| `apps/web/public/app.js` | All chrome behavior (split `openThread` later if file > ~2.5k lines) |
| `apps/web/src/server.ts` + `host.ts` | `/api/file`, richer `/api/diff`, optional `/api/jump` |
| `apps/web/src/server.test.ts` | HTTP + HTML/JS contract tests |
| `packages/core` | Only if `@file` mention parse or pin events need a type |
| `docs/adr/0026-*.md` (and 0027 if split panes need their own) | Jump/actions/diff/plan/panes |
| `docs/specs/web-ui.md` | Contract |
| `CHANGELOG.md` | `[Unreleased]` |

## Phases (ship in this order)

Do not start Phase N+1 until Phase N is in the UI and Ctrl+F5-verified.

1. Jump + keyboard (Slack muscle)
2. Message + rail context menus (Discord muscle)
3. Composer: Enter send, `@path` from workspace
4. Readable diffs
5. Plan card before tools
6. Windows snap: right-click / drag to split panes
7. UI slash table (same ids; **not** CLI TUI)
8. Context: trim + LLM compact + `/context`
9. Settings **Jobs**: title / compact / vision AIs

Handoff for a new session: `docs/superpowers/handoffs/2026-08-27-office-ui.md`.

---

### Task 1: ADR + jump palette (Ctrl/Cmd+K)

**Files:**
- Create: `docs/adr/0026-office-jump-and-actions.md` (covers Tasks 1–2; panes get 0027)
- Modify: `apps/web/public/{index.html,app.css,app.js}`, `apps/web/src/server.test.ts`, `docs/specs/web-ui.md`, `docs/adr/README.md`, `CHANGELOG.md`

**Interfaces:**
- Produces: `openJump()`, `jumpItems(): { kind, id, label, hint }[]`, overlay `#jump` 

**ADR outcome (write this):** Jump is a Slack-style palette over channels, people, and DM chats. Keyboard: `Ctrl+K` / `Cmd+K` open, type filters, Enter opens in the **active pane**. Escape closes. English copy.

- [ ] **Step 1: Failing test** in `apps/web/src/server.test.ts`

```ts
test("jump palette is in the office page", async () => {
  const { server, url } = await setup();
  try {
    const page = await (await fetch(`${url}/`)).text();
    expect(page).toContain("id=\"jump\"");
    const js = await (await fetch(`${url}/app.js`)).text();
    expect(js).toContain("openJump");
    expect(js).toContain("ctrl+k") || expect(js).toMatch(/key === \"k\"/);
  } finally {
    server.stop(true);
  }
});
```

- [ ] **Step 2: Run** `bun test apps/web/src/server.test.ts` — expect FAIL (no `#jump`)
- [ ] **Step 3: HTML** — overlay after `.app`:

```html
<div id="jump" class="jump" hidden>
  <input id="jump-q" type="search" placeholder="Jump to channel, person, or chat" />
  <ul id="jump-list"></ul>
</div>
```

- [ ] **Step 4: JS** — `keydown` on document: if `(ev.ctrlKey \|\| ev.metaKey) && ev.key === "k"` and no `dialog[open]`, `preventDefault`, `openJump()`. Build rows from `bootstrap.channels`, `bootstrap.bots`, `bootstrap.dms`. Filter by `q`. Arrow keys + Enter call existing `openThread` / `openPersonDm`.
- [ ] **Step 5: CSS** — centered overlay, max 420px, same `--lift` / `--line` as palettes. Selected row `.on` like `.palette button.on`.
- [ ] **Step 6: Tests pass.** ADR-0026 + spec bullet + CHANGELOG. Ctrl+F5: Ctrl+K, type `cod`, Enter.

---

### Task 2: Context menus (rail + messages)

**Files:** Modify `apps/web/public/{index.html,app.css,app.js}`

**Interfaces:**
- Produces: `openMenu(x, y, items: { id, label, danger?: boolean }[])`, `#ctx-menu`

Copy: **Open**, **Open to the right**, **Open below**, **Copy id**, **Copy message**, **Pin** (client pin list in `sessionStorage` for v1 — do not rewrite JSONL; optional later `message.pinned` append), **Mark unread**.

- [ ] **Step 1: Test** — page contains `id="ctx-menu"`; js contains `openMenu` and `contextmenu`.
- [ ] **Step 2: `#ctx-menu`** — `position:fixed; z-index` above jump. Hide on click-outside, Escape, scroll (same pattern as `helpTip` freeze).
- [ ] **Step 3: Rail** — `contextmenu` on channel buttons, person rows, `.dm-row`. Prevent default browser menu.
- [ ] **Step 4: Messages** — `contextmenu` on `.msg`. Items: Copy, Copy id (`@coder` / none), Mark unread. Pin = prepend a “Pinned” strip in the header from `sessionStorage` key `crew.pins:{kind}:{id}`.
- [ ] **Step 5: “Open to the right / below”** — stub that calls `splitOpen(kind, id, "right"|"below")` even if split is a no-op until Task 6 (must not throw). Task 6 fills it.
- [ ] **Step 6: Verify** — right-click `#landing` and a message; menu English; Delete-style items use `.danger`.

---

### Task 3: Composer — Enter sends, `@path` from disk

**Files:**
- Modify: `apps/web/public/app.js` composer keydown (today: Enter without Shift already sends — confirm IME: skip if `ev.isComposing \|\| ev.keyCode === 229`)
- Create: `apps/web/src` `GET /api/paths?q=` → workspace-relative files (cap 50, skip `.git`, `node_modules`, `.env`)
- Modify: palette already handles `@bots`; extend for paths when token looks like `@src` or `@./`

**Interfaces:**
- `GET /api/paths?q=src` → `{ paths: string[] }`
- Palette rows: `@coder` (person) vs `src/app.ts` (file). Insert `@src/app.ts ` into draft. On send, leave the mention in the text so bots `read` it (no inbox copy unless they also used + File).

- [ ] **Step 1: Test**

```ts
test("GET /api/paths lists workspace files", async () => {
  const { server, url, cwd } = await setup();
  writeFileSync(join(cwd, "hello.ts"), "export {}\n");
  const res = await (await fetch(`${url}/api/paths?q=hello`)).json();
  expect(res.paths).toContain("hello.ts");
});
```

- [ ] **Step 2: Implement `listPaths(host, q)`** in `host.ts` — `readdir` recursive depth ≤ 4, ignore denylist, match `q` case-insensitive. Never return `.env` or `.ssh`.
- [ ] **Step 3: Palette** — if `atToken` remainder includes `/` or `.`, fetch `/api/paths`. Mix bots first, then paths.
- [ ] **Step 4: Enter** — keep send on Enter, Shift+Enter newline, **IME guard**. Document in `web-ui.md`.
- [ ] **Step 5: Ctrl+F5** — type `@hel`, pick `hello.ts`, send; message contains the path.

---

### Task 4: Readable diffs

**Files:** `apps/web/src/host.ts` `threadDiff` (already exists — expand payload), `index.html` files modal or a right **Diff** sheet, `app.js` `files-btn`

**Interfaces:**
- Today: `GET /api/diff?kind&id` returns short path list.
- Produce: `{ path, tool, snippet?: string }[]` where `snippet` is a short unified hunk from the last `apply_patch` args (`old_text`/`new_text`) already on the JSONL tool event — **do not re-read a rewrite of JSONL**. If args missing, path-only row.

- [ ] **Step 1: Test** — after a scripted `apply_patch` in an existing say test (or new), `GET /api/diff` includes `snippet` containing a `+` or `-` line.
- [ ] **Step 2: Expand `threadDiff`** — from tool events, if `name === "apply_patch"` and args have `old_text`/`new_text`, build a 20-line unified snippet. Cap.
- [ ] **Step 3: UI** — files modal: each path is a `<details>` with `<pre class="diff">`. Red/green lines via CSS `.diff-add` / `.diff-del`. No Accept/Reject in this task (would need a new apply path). Readable is the familiarity win.
- [ ] **Step 4: Verify** — run a bot that patches, open **files**, expand a path, see a hunk.

---

### Task 5: Plan card (before / during work)

**Files:** `apps/web/public/app.js` NDJSON `say` handler, CSS `.plan-card`

**Architecture (no extra model round required for v1):**
- When a bot’s first account or a `thinking` block contains a markdown list of steps, **or** when tools start, show a **Plan** card in the thread: “Coder is working” + last tool line (`Reading index.html` — already in activity).
- Better v1 that still feels like Claude: if the human message is long / contains “plan” / first reply has no tools yet, the existing thinking fold stays; add a sticky **chip** under the header: `Coder · Reading index.html` (reuse `state.activity`).
- Full “edit the plan markdown then approve” is **Phase 5b** — needs a bot instruction + `permission.asked` style gate. Do 5a (visible live plan/activity in the chat column) first.

**5a Interfaces:**
- `#work-chip` in `.chat-top`, text from `state.activity` for woken bots in this thread. Hidden when idle.

**5b (same task if time, else follow-up):**
- ADR note: Plan mode = bots must post a `plan` event (new JSONL type = 0.x minor). Human **Run** / **Edit**. Until that ADR, do not invent a silent extra LLM call.

- [ ] **Step 1: Test** js contains `work-chip`; html `id="work-chip"`.
- [ ] **Step 2: Chip** — update on `status` / `tool` / `done` NDJSON the same way `setActivity` works; also set `#work-chip`.
- [ ] **Step 3: CHANGELOG** — “Header shows who is working, like Discord activity in the chat.”
- [ ] **Step 4: Do not implement computer-use.** If 5b is not started, write a single paragraph in ADR-0026 Consequences: plan-approve is a later event type.

---

### Task 6: Windows snap — split panes (right-click + drag)

**Files:** `index.html` `.stage` becomes a split host; `app.css`; `app.js` `splitOpen`

**Interfaces:**

```js
state.panes = [
  { kind: "channel"|"dm", id: string },
  null | { kind, id },
];
state.split = "none" | "right" | "below"; // none = one pane

function splitOpen(kind, id, how /* "right" | "below" | "replace" */)
function paneOpen(index, kind, id) // reuses render of log/composer
```

**Behavior (Windows Snap, in the page — not OS windows):**
- One chat = today’s single `.chat`.
- **Open to the right** → `split = "right"`, CSS `grid-template-columns: 1fr 1fr` (or rows if `below`).
- Drag a rail channel/DM onto the **right half** of the stage → dock right; onto the **bottom half** → stack. Drag onto the current chat → replace.
- Drop targets: two ghost overlays `#drop-right` `#drop-below` while dragging (`dragstart` on rail buttons with `application/x-crew-thread` payload `kind:id`).
- Each pane: own header, log, composer, mode chip. Shared rail + desk.
- Close (X on pane header) → back to one pane.
- `sessionStorage` `crew.split` restore on load.
- Independent `openThread` per pane: extract `renderThreadInto(elsPane, kind, id)` so two logs don’t share `#log`. **This is the hard cut:** today’s `els.log` is a singleton. Task 6 **must** clone the chat column or parameterize it.

**Refactor (required before split works):**
- Wrap current `.chat` in `#pane-0`. Template `#pane-1` cloned from it (or two static columns, second `hidden`).
- Replace `els.log` with `pane(i).log`. `state.activePane = 0|1`. Jump/open from rail uses `activePane` unless `splitOpen` specified.

- [ ] **Step 1: Test** html contains `id="pane-0"` and `id="pane-1"`; js contains `splitOpen` and `application/x-crew-thread`.
- [ ] **Step 2: Duplicate chat column in HTML** (pane-1 hidden). Move ids to class + `data-pane`. JS queries per pane.
- [ ] **Step 3: `splitOpen`** + CSS grid. Verify one channel left, one DM right, both send independently.
- [ ] **Step 4: Drag-drop** from rail. Ghost highlights. Right-click items from Task 2 now call the real `splitOpen`.
- [ ] **Step 5: ADR-0027** “in-page snap panes; not OS windows; max two panes v1”. Spec + CHANGELOG.
- [ ] **Step 6: Ctrl+F5** — drag Coder DM to the right of `#landing`; both composers work; X closes split.

**v1 limits:** max **two** panes. No floating OS windows. No three-up. Resize handle between panes (minmax 280px).

---

### Task 7: UI slash table (not CLI)

Claude/Codex/Grok put 50–100 commands in a TUI. Crew copies **the dozen that are engine ops**, in the **composer palette only**.

**Ids (exact):** `help` `clear` `compact` `stop` `mode` `model` `status` `diff` `export` `new`

**Files:** `apps/web/public/app.js` `runSlash` / palette list (already has stop/retry/clear/new-person/new-channel/settings). Extend, do not remove existing office commands (`new-person` stays).

- [ ] **Step 1:** Test js contains `"/compact"` and `"/status"` in the cmds array.
- [ ] **Step 2:** `/help` opens a small sheet listing commands. `/status` shows keep window, last compact ts, message count (from bootstrap or `/api/thread` meta). `/new` = `newPersonChat` when in a human DM, else no-op with a toast. `/compact` calls Task 8 API (stub 400 until Task 8). `/diff` opens files modal. `/export` existing. `/mode` `/model` open existing sheets.
- [ ] **Step 3:** Do **not** add these to `crew open`. CHANGELOG + `web-ui.md` slash list.

---

### Task 8: Context — window + trim + LLM compact

**Research (lock this):**

- Claude: (1) trim tool results, (2) cache-friendly, (3) structured LLM summary; then re-read ~5 recent files; CLAUDE.md reloads from disk.
- Codex: one “handoff summary” for the next model.
- Grok/xAI API: opaque compaction item — **do not** store that as truth.
- Crew today: last 80 `message.posted`, `thread.compacted` marker, **no summary** (`ADR-0019`). Full JSONL still on disk. Good layer 1.

**Layers (append-only, UI still shows full log):**

1. **Window** — keep last N posted (N in Settings, default 80).
2. **Trim** — `buildHistory` / turn prompt omits old `tool.completed` bodies; JSONL unchanged.
3. **Summary** — job `compact` (Task 9) writes `thread.summary` `{ text, keptFrom, model, botId? }`. Prompt = system (soul, rules, skills from **disk**) + latest summary + last K messages. After compact, inject “re-read paths you still need; disk is truth.”

**ADR-0028** (or fold into 0026): qualifies 0019; does not rewrite it.

**Files:** `packages/core/src/compact.ts`, `prompt.ts`, `packages/core/src/compact.test.ts`, `apps/web` `/api/compact` POST `{ kind, id }`, `/compact` slash, header chip `78/80 · compacted`.

**Structured summary prompt (Claude-shaped, English):** User intent; decisions; files touched (exact paths); errors; remaining todos; do not invent.

- [ ] **Step 1:** Test `maybeCompact` still windows; new `buildHistory` includes `thread.summary` content when present; posted after `keptFrom` still verbatim.
- [ ] **Step 2:** Test LLM compact with `ScriptedProvider` — appends `thread.summary`, does not delete JSONL lines.
- [ ] **Step 3:** `POST /api/compact` uses job compact model (fallback workspace default). UI `/compact` + auto when posted count > keep * 0.7 (once per threshold).
- [ ] **Step 4:** `/context` or status chip: posted, keep, hasSummary, lastCompactAt. English.
- [ ] **Step 5:** Ctrl+F5 on a long thread; compact; log still scrollable; next bot turn does not quote dropped messages as if live.

---

### Task 9: Settings Jobs (title, compact, vision)

**Research:** Cursor Chat vs Tab vs Apply; Aider architect vs editor; Continue roles. Crew already has per-**person** models for talking. Jobs are **hidden workers**.

**Store:** `.crew/jobs.json` (or `config.json` `jobs` key — prefer **`jobs.json`** so PATCH of config does not wipe). Shape:

```json
{
  "title": { "model": "z-ai/glm-5.3-flash", "botId": null },
  "compact": { "model": "z-ai/glm-5.3-flash", "botId": null },
  "vision": { "model": "", "botId": null },
  "read": { "model": "", "botId": null }
}
```

`botId` optional: if set, wrap the job prompt in that person’s Soul (they are not woken in the channel). Empty `model` → workspace default.

**Title:** On first `message.posted` in a DM that has no `thread.titled`, run title job → append `thread.titled` `{ title, description, model }`. Direct list uses `title` + `description`. Human: Settings → Jobs; per-chat “Regenerate title” uses current title job. User can change who writes titles anytime (next regen / next new chat).

**Vision:** If attached file is image (`png|jpg|webp|gif`) and vision job has a model, caption in English, prepend to the human message as `[image inbox/x.png: …]` so the room’s bots only see text. If vision job empty, attach path only (today).

**Read job:** optional gist of a text file when used for title context (`read` tool via Scripted/native, cheap model). If unset, skip.

**UI:** Settings sheet section **Jobs** — four rows: label, model `<select>` from Allowed, person `<select>` (none + bots). Help `?` on each.

**ADR-0029** jobs. Tests: write jobs.json; POST dm creates titled event with ScriptedProvider; compact uses compact model id from jobs.json.

- [ ] **Step 1:** Failing tests for `loadJobs` / `saveJobs` and titled event.
- [ ] **Step 2:** Core or `apps/web` host: `runJob(host, job, prompt, { image? })` → one-shot `complete` no tools (except `read` job may `read`).
- [ ] **Step 3:** Wire DM first post → title. Attach image → vision. Compact → compact job.
- [ ] **Step 4:** Settings UI. Ctrl+F5: pick a cheap model for titles; new Coder chat; first message; Direct title updates.

---

### Task 10: Docs sweep

- [ ] `docs/specs/web-ui.md` — jump, ctx menu, `@path`, diff snippets, work chip, split panes, slash list, `/api/paths`, `/api/compact`, Jobs.
- [ ] `docs/adr/README.md` — 0026–0029 as landed.
- [ ] `docs/specs/session-jsonl.md` — `thread.summary`, `thread.titled`.
- [ ] `AGENTS.md` — UI-first; jobs; compact layers. Parked files linked.
- [ ] `CHANGELOG.md` `[Unreleased]` one bullet per shipped phase.
- [ ] Handoff file: tick what shipped.

---

## Verification (human)

After each phase: `bun test`, `bun run ui`, Ctrl+F5.

| Phase | What to click |
|---|---|
| 1 | Ctrl+K → `landing` |
| 2 | Right-click a message → Copy |
| 3 | Enter sends; `@src` lists a file |
| 4 | files chip → hunk |
| 5 | while a bot works, header chip updates |
| 6 | drag DM to the right; two composers |
| 7 | `/` → compact, status, new |
| 8 | `/compact` then keep chatting; log still full |
| 9 | Settings → Jobs → title model; new DM title appears |

---

## Verification (human)

After each phase: `bun test`, `bun run ui`, Ctrl+F5.

| Phase | What to click |
|---|---|
| 1 | Ctrl+K → `landing` |
| 2 | Right-click a message → Copy |
| 3 | Enter sends; `@src` lists a file |
| 4 | files chip → hunk |
| 5 | while a bot works, header chip updates |
| 6 | drag DM to the right; two composers |

## Self-review

- Spec coverage: jump, menus, Enter/@file, diffs, plan/activity, snap, UI slash, compact layers, job AIs, parked computer-use/browser/CLI-TUI — each has a task or a parked file.
- Not in this program: reactions, huddles, MCP, git PR, usage meters, image gen, three panes, Electron, `crew open` TUI, computer-use.
- `splitOpen` is stubbed in Task 2 and implemented in Task 6 — same function name.
- Compact: JSONL never rewritten; summary is a new event; title is `thread.titled`.
