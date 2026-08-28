# Settings + Providers Implementation Plan

> **Status:** Slice A **done** (2026-08-28). `ADR-0030` + `ADR-0031`. Do not start slice B (spawn) or C (MCP) until Arda names them. TDD. User-visible → CHANGELOG `[Unreleased]`. UI English.

**Goal:** Finish Settings (T3 Providers tab, forgotten General/Permissions/About fields, Person implementation picker fed only from Providers) without spawning Claude/Codex/Grok/OpenCode yet.

**Architecture:** Crew remains the engine. OpenRouter stays the talk path in slice A. Harness cards are visible/detectable and stored, but turns ignore `harness` until slice B. Config split: `config.json` (key, models, new flags) vs `providers.json` (on/off, binary) vs `permissions.json` vs `jobs.json`.

**Tech stack:** TypeScript, Bun, `apps/web` public HTML/JS/CSS, `packages/core` bot record, existing `/api/*`.

**Spec:** `docs/superpowers/specs/2026-08-28-settings-providers-design.md`

## Global constraints

- TDD: failing test first. `bun test`. Fake provider, no OpenRouter in unit tests.
- Architecture change → next ADR in `docs/adr/` + README. Do not rewrite accepted ADRs.
- `packages/core` still no fetch/UI. Provider detect/spawn stays in `apps/web` (or a new adapter package), not core.
- UI copy English. No Electron, Discord, MCP, `crew serve`, exe in this slice.
- Jobs stay OpenRouter **runtime**. UI: Title/Compact/Vision/Read share the implementation picker (`ADR-0031`). `botId` still accepted for Soul wrap if present. Spawn of a job harness is out.

## Files

| Path | Role |
|---|---|
| `docs/adr/0030-providers-and-person-harness.md` | Store + picker + harness field; spawn is later |
| `packages/core/src/workspace.ts` | `BotRecord.harness` |
| `packages/workspace-fs/src/fs-workspace.ts` | persist harness |
| `apps/web/src/config.ts` | `defaultPermissionMode`, `autoCompact`, `reviewerModel` |
| `apps/web/src/providers.ts` | load/save `.crew/providers.json`, PATH detect (no spawn) |
| `packages/core/src/always.ts` | add/remove one rule |
| `apps/web/src/host.ts` `server.ts` | APIs |
| `apps/web/public/index.html` `app.js` `app.css` | tabs, picker, cards |
| `docs/specs/web-ui.md` `CHANGELOG.md` | contract + unreleased |

## Slice A tasks

### 1. Always Add + per-row delete

- Extend `always.ts`: `addAlwaysRule(crewRoot, tool, args)`, `removeAlwaysRule(crewRoot, tool, key)`.
- `POST /api/permissions` `{ tool, path? , command? }` → 200 list. `DELETE /api/permissions?tool=&key=` one row. Existing DELETE with no query still clears all.
- Settings: tool select, text field, Add; each row a delete chip.
- Tests: add apply_patch path; match `fingerprint`; delete one leaves the other.

### 2. Default room mode + reviewer + auto-compact + base URL + About path

- Config keys with defaults: `defaultPermissionMode: "auto-accept"`, `autoCompact: true`, `reviewerModel: ""`, `baseUrl` already exists — **expose in UI** (Providers OpenRouter card).
- New channel/DM create reads `defaultPermissionMode`.
- Compact auto path no-ops when `autoCompact === false`.
- `effectiveMode` already falls back without reviewer; Settings reviewer is stored for slice B/auto — if unused in A, still persist and show.
- About shows `cwd`.
- Tests: create channel inherits mode; compact-status/auto not firing when flag off (or host helper).

### 3. ADR-0030 + providers.json + BotRecord.harness

- ADR: providers are Settings cards; picker is fed by them; `harness` on the person; spawn out of A.
- `defaultProviders()`: openrouter on; claude/codex/grok/opencode off.
- `GET/PUT /api/providers`. PATCH `/api/key` must not touch this file.
- Bot PATCH accepts `harness` null or one of the four ids. Unknown → 400.
- Talk/dispatch **ignores** harness in A (test that a harness person still completes via OpenRouter/scripted provider).

### 4. Settings tabs: Providers replaces Models

- Tab **Providers**. Remove Models tab (move catalog+whitelist into OpenRouter card).
- Cards: OpenRouter (key, base URL, allowed, catalog). Four harness cards: logo, toggle, status from `where`/PATH (Windows `where.exe`), optional binary path.
- General: default implementation picker, fallback, new-room mode, auto-compact. No key here.
- CSS: provider cards, picker groups. Copy English.
- Tests: HTML ids; visual Settings → Providers.

### 5. Person + General picker

- One JS picker: OpenRouter allowed models, then ready harnesses (disabled + title “Not wired yet” in A if we list them, or omit until Ready **and** adapter — **omit from selectable list in A**, show on the card only).
- Person Model `<select>` replaced. Fallback hidden unless OpenRouter.
- Persist `model` and `harness` on save.
- Tests: page has picker markup; PATCH bot roundtrip.

### 6. Docs + CHANGELOG + visual

- `docs/specs/web-ui.md` Settings map and APIs.
- CHANGELOG `[Unreleased]`.
- `tour/visual.ts`: Providers tab, no Models tab, Always Add, About path.
- `bun test` + visual  pass.

## Slice A — landed (do not re-do)

Providers tab, health + extras PATH, customModels, grouped picker in dialog, Jobs four slots on the same picker, Always Add, default room mode, auto-compact, reviewer, About cwd. Docs: `web-ui.md`, CHANGELOG `[Unreleased]`, `AGENTS.md`, `ADR-0030`/`0031`.

## Slice B (do not start in the same breath)

Grok adapter first (ACP/CLI), then Claude, Codex, OpenCode. Picker enables the row when Ready. Mention wake still Crew; desk work is the child process. New ADR if the Provider port is not enough.

## Slice C (later)

Settings **MCP** tab, `.crew/mcp.json`, tools on Crew-native turns only.

## Out

Exe, theme, plugin store, Cursor/Amp, forwarding MCP into harnesses, Jobs-via-harness.
