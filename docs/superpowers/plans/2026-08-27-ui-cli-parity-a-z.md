# UI + CLI parity A–Z

> **For agentic workers:** Use executing-plans or subagent-driven-development. Checkboxes track tasks.

**Goal:** Everything the office can do in the web UI is also doable from `crew`, and the remaining UI holes (delete, search, scroll lock, diff, persistent Always, skill body edit, clear/export) ship. Remote `crew serve` stays out of this plan.

**Architecture:** Same hexagonal core. CLI and `apps/web` stay adapters. New workspace methods (`removeBot`, `removeChannel`) live in `@crew/core` + `workspace-fs`. Persistent “Always” is `.crew/permissions.json`, read by both CLI `defaultAsk` and web `sayChannel` ask. Diff is derived from existing `tool.requested` JSONL (`apply_patch` path, `shell` command) — no second event type unless payload is missing.

**Tech Stack:** TypeScript, Bun, JSONL store, `apps/cli`, `apps/web`.

## Global Constraints

- TDD: failing `bun test` first, then code. ScriptedProvider only — never OpenRouter in unit tests.
- Architecture change → ADR. User-visible → `CHANGELOG.md` `[Unreleased]`.
- UI copy English. JSONL append-only. “Clear” is a UI bookmark, not a truncate.
- Do **not** add Electron, Discord API, MCP, git auto-PR, or `crew serve` (that is `docs/todos/multi-human-remote.md`).
- Caps: `MAX_BOTS = 16`, `MAX_CHANNELS = 16` in `packages/core/src/org.ts`.
- Slugs: `assertSlug`. Reserved: `human`, `you`, `everyone`, `engine`.

## File map

| File | Role |
|---|---|
| `packages/core/src/workspace.ts` | `removeBot`, `removeChannel` on the port + MemoryWorkspace |
| `packages/workspace-fs/src/fs-workspace.ts` | Disk delete of `.crew/bots/<id>` and `.crew/channels/<id>` |
| `packages/core/src/always.ts` (new) | Load/save/match Always rules |
| `apps/cli/src/run.ts` | New subcommands + `/stop` + USAGE |
| `apps/cli/src/run.test.ts` | CLI tests |
| `apps/cli/src/config.ts` | Wire `fallbackModel` / `allowedModels` on `config set` |
| `apps/web/src/host.ts` | remove, diff, permission store, skill body |
| `apps/web/src/server.ts` | DELETE routes, GET diff, GET skill, persist Always |
| `apps/web/public/{index.html,app.css,app.js}` | Delete, search, pin-scroll, diff, skill editor, Always, clear/export |
| `docs/specs/cli.md` | Match real USAGE |
| `docs/adr/0018-office-delete-and-always.md` | Delete + persistent Always |

---

### Task A: Workspace remove

**Produces:** `removeBot(id: string): void`, `removeChannel(id: string): void`

- [ ] Test Memory + Fs: remove deletes; unknown throws `unknown bot` / `unknown channel`.
- [ ] Fs: `rmSync` directory recursive. **Do not** delete JSONL.
- [ ] Removing a bot drops that id from every channel `memberBotIds`. Empty channel is allowed (wakes nobody).
- [ ] Commit: `feat: workspace removeBot/removeChannel`

---

### Task B: Persistent Always

**Produces:**

```ts
export type AlwaysRule = { tool: string; key: string };
export function alwaysPath(crewRoot: string): string; // .crew/permissions.json
export function loadAlways(crewRoot: string): AlwaysRule[];
export function saveAlways(crewRoot: string, rules: AlwaysRule[]): void;
export function fingerprint(tool: string, args: Record<string, unknown>): string;
export function matchesAlways(rules: AlwaysRule[], tool: string, args: Record<string, unknown>): boolean;
```

Fingerprint subset of args only: `path`, `command`, `name` (skill), `id` (create). Same subset in CLI and web.

- [ ] Test: round-trip; same `apply_patch`+path matches; other path does not.
- [ ] CLI `defaultAsk`: match → `"allow"`; `"always"` appends and saves.
- [ ] Web `sayChannel` ask: match → `"allow"` and **no** `type:"ask"` stream row. `"always"` saves then allows.
- [ ] Commit: `feat: persist Always permission rules`

---

### Task C: CLI bot update + soul

```
crew bot create <id> [--name TEXT] [--model ID] [--soul FILE] [--icon TEXT]
crew bot update <id> [--name TEXT] [--model ID] [--fallback ID] [--soul FILE] [--orders FILE] [--icon TEXT]
crew bot show <id>
```

- [ ] Test: `--soul FILE` writes SOUL.md; update name persists; show prints id/name/model/fallback/skill names.
- [ ] USAGE + `docs/specs/cli.md` (spec currently lies about `--soul FILE`).
- [ ] Commit: `feat: crew bot update/show and soul file`

---

### Task D: CLI skills

```
crew skill list [bot]
crew skill show <bot> <name>
crew skill add <bot> --name N --desc D [--body FILE]
crew skill copy <fromBot> <name> <toBot>
```

Human CLI may `addSkill` on any bot (operator owns the office). Agents still use strict `skill_acquire` (copy or self-write only).

- [ ] Tests: add+show body; copy copies body; list prints `bot/name`.
- [ ] Commit: `feat: crew skill list/show/add/copy`

---

### Task E: CLI stop

`crew say` is one-shot (Ctrl+C). `crew open` needs `/stop`.

- [ ] Shared `{ stopped: boolean }` as `shouldStop` on in-flight `dispatchChannelPost` (already on DispatchBase).
- [ ] `/stop` with no run prints `nothing running`.
- [ ] Test: `dispatch.test.ts` `shouldStop: () => true` after first wave drops the rest.
- [ ] Commit: `feat: /stop in crew open`

---

### Task F: CLI config parity

```
crew config set fallback <model>
crew config set allowed <id,id,...>
crew config show   # add fallback + allowed lines
```

Types already exist on `CrewConfig`.

- [ ] Test: set fallback + allowed; show prints them from project config.
- [ ] Commit: `feat: crew config fallback and allowed models`

---

### Task G: UI delete

```
DELETE /api/bot/:id
DELETE /api/channel/:id
```

- [ ] Test: DELETE coder, bootstrap omits coder; unknown 404.
- [ ] UI: `×` on person row and Delete in room modal. Confirm: “Delete @coder? Logs stay.”
- [ ] If current thread was that DM/channel, open first remaining channel.
- [ ] Commit: `feat: delete bot and channel from UI`

---

### Task H: Skill body editor

Today `botDetail.skills` has name+description only.

- [ ] `GET /api/bot/:id/skills/:name` via `workspace.getSkill`.
- [ ] Test: addSkill with body, GET returns body.
- [ ] UI: skill card click fills name/desc/body; Add skill POST overwrites (already).
- [ ] Commit: `feat: edit skill body in person modal`

---

### Task I: Search + scroll lock

Client-only.

- [ ] Header `#search` filters `.msg` text; Enter = next match.
- [ ] `pinBottom`: if more than 80px from bottom, do not auto-scroll. Show dock chip `↓ new`; click pins.
- [ ] HTML test: page contains `id="search"` and `id="jump-latest"`.
- [ ] Commit: `feat: search, jump-latest, scroll lock`

---

### Task J: Diff panel

```ts
export function threadDiff(host, kind, id): { path: string; botId: string; ts: string; tool: string }[]
```

From `tool.requested` where name is `apply_patch` (path) or `shell` (command as path-like).

- [ ] Test: fake event in temp store; GET `/api/diff?kind=channel&id=landing` returns it.
- [ ] UI: room chip `files` lists paths (read-only).
- [ ] Commit: `feat: thread file touch list`

---

### Task K: Clear + export

- [ ] `/clear` sets `sessionStorage crew.clearedAt[threadKey] = now`. `openThread` skips older messages. JSONL untouched.
- [ ] Export button: download current GET `/api/thread` JSON as `channel-<id>.json`.
- [ ] Commit: `feat: /clear bookmark and export thread JSON`

---

### Task L: Always in Allow/Deny card + Settings

- [ ] Always POST `{ decision:"always", tool, args }` (Task B saves).
- [ ] Settings: list rules, Clear all → `DELETE /api/permissions`.
- [ ] Test: POST always, `matchesAlways` true on next ask.
- [ ] Commit: `feat: Always UI and clear`

---

### Task M: Docs

- [ ] `docs/specs/cli.md` = USAGE.
- [ ] ADR-0018: delete does not rewrite logs; Always is per-project.
- [ ] CHANGELOG `[Unreleased]`.
- [ ] Copy this plan to `docs/superpowers/plans/2026-08-27-ui-cli-parity-a-z.md` on execute.
- [ ] Commit: `docs: CLI spec and ADR-0018`

---

## Out of this plan

- `crew serve` / invite tokens
- Electron, Discord Gateway, MCP, git PR, worktrees, cost meters, LLM `/compact`, `/rewind` disk rollback

## Order

A → B → C D E F (CLI) → G H I J K L (UI) → M docs.

Each letter green `bun test` before the next.

## Coverage

| Gap | Task |
|---|---|
| CLI bot update/soul | C |
| CLI skills | D |
| CLI /stop | E |
| CLI fallback/allowed | F |
| UI delete | G |
| Skill body edit | H |
| Search / scroll | I |
| Diff/files | J |
| Clear/export | K |
| Always persist | B + L |
| crew serve | excluded |
