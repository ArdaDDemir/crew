# Settings, Providers, and the Person picker

Date: 2026-08-28  
Status: **slice A shipped**. **Slice B harness spawn shipped** (`ADR-0034`/`0035`). **Slice C MCP shipped** (`ADR-0036`). Plugin marketplace is out.  
Owner: Arda  
ADRs: `0030` (providers.json + harness field), `0031` (grouped picker, Jobs impl slots, customModels).

Crew stays the office (channels, `@`, DMs, JSONL). T3 is the Settings / picker pattern, not a product clone. UI copy English.

## Shipped vs this draft

Keep the body below as the original plan. These are the decisions that landed differently or later in the same slice:

- Picker groups by **provider** (All, OpenRouter, Claude, Codex, Grok, OpenCode), not OpenRouter vendor prefixes and not a “Harnesses” bucket of CLI names only.
- Harness models are listed (CLI / cache / fallbacks + **custom models** on the card), not a single “Claude” row.
- Jobs Title / Compact / Vision / Read all use that picker (`ADR-0031`). Compact/Vision/Read are not a person `<select>`. Runtime is still Crew/OpenRouter; a job `harness` is stored and ignored until spawn.
- Enable + installed (health extras include `%USERPROFILE%\.local\bin`) puts the harness in the picker. Spawn is still later.
- Picker menu lives inside the open Settings/Person `<dialog>` (top layer).

## What exists today

Settings tabs: **General** (OpenRouter key, default model, fallback) · **Models** (whitelist + catalog) · **Jobs** · **Permissions** (Always list + Clear all) · **About**.

Person sheet: Model + Fallback + Chat titles (plain `<select>` of allowed OpenRouter ids).

Always rules only appear after a live Allow/Always/Deny card. Default channel mode is `auto-accept`, so the card rarely shows and the Permissions list stays empty. There is no Add.

Engine already has, with no Settings field: `baseUrl` (`CREW_BASE_URL`), `auto` reviewer (missing → supervised), auto-compact (always on at 56 posts).

## Product rules

1. Person picks **one implementation** (replaces Model). Same picker as Settings → General default.
2. Picker contents come **only** from Settings → **Providers**. Closed / not installed / not whitelisted = not in the picker.
3. OpenRouter model → Crew engine (our tools, Skills, permission card, Jobs).
4. Claude / Codex / Grok / OpenCode → that installed CLI for **that person's turns**. Channel, `@`, DM, JSONL stay Crew.
5. Jobs stay **Crew/OpenRouter** even if the named person is a harness (cheap one-shot; do not spawn Claude to title a DM).
6. Do not ship: Electron, Discord API, `crew serve`, computer-use, theme switcher, T3 plugin marketplace, Cursor/Amp/Copilot extra harnesses.

## Settings tabs (final map)

| Tab | Stays / moves / new |
|---|---|
| **General** | Workspace defaults only. Key moves to Providers. |
| **Providers** | New. Replaces **Models**. T3-shaped cards. |
| **Jobs** | Same (Title model; Compact/Vision/Read person). |
| **Permissions** | Always **Add** + row delete + Clear; reviewer model; default mode for **new** rooms. |
| **MCP** | Later slice. Not in first start. |
| **About** | Version + workspace path. |

### General

- **Default implementation** — same picker as Person (OpenRouter model or a harness). Empty person uses this.
- **Default fallback** — OpenRouter ids only. Used when default (or person) is an OpenRouter model and the primary errors. Hidden/disabled if default is a harness.
- **New room mode** — `supervised` \| `auto-accept` (default) \| `auto` \| `full-access`. Applies to newly created channels and DMs. Existing rooms stay on the channel sheet / header chip.
- **Auto-compact** — on/off. On = current behavior (posted > 56, once per thread). Off = only `/compact`.

### Providers (replaces Models)

Cards, logo + name, on/off, status line.

**OpenRouter (Crew)** — always present, on by default.

- API key (today’s General key).
- Base URL (empty = `https://openrouter.ai/api/v1`).
- Allowed models + catalog search (today’s Models tab, moved here).
- Whitelisted ids are the OpenRouter rows in the picker.

**Claude** · **Codex** · **Grok** · **OpenCode** — off until enabled.

- Detect binary on `PATH` (or a Binary path field).
- Status: Not installed / Installed, not logged in / Ready.
- Enable is stored even if not ready; picker only lists **Ready** (or Installed if we cannot probe login cheaply — probe must not hang the UI).
- No spawn in the first slice: enabling a harness must not break `@` turns. Picker may show the row as coming/disabled until the adapter exists, **or** selecting it is rejected with an English toast until that adapter ships.

Do not add extra T3 fields in v1 (shadow home, CLAUDE_CONFIG_DIR, env-var editor). Binary path only if detect fails.

### Jobs

Unchanged behavior. Title = OpenRouter model. Compact/Vision/Read = one person (soul + **that person's OpenRouter model**, or workspace default). Harness id on the person is ignored for Jobs.

### Permissions

- Always list from `.crew/permissions.json`.
- **Add:** tool `apply_patch` \| `shell` + fingerprint field (path or command). Writes the same `{ tool, key }` shape `rememberAlways` uses (`tool:{json of path|command|name|id}`).
- Per-row delete. Clear all stays.
- **Reviewer model** — OpenRouter select, empty = `auto` keeps falling back to `supervised`.

Channel mode does not live here (still per-room).

### About

- Version `0.3.0`.
- Workspace path (`cwd`).
- Desktop window note stays (do not start exe until Arda says so).

## Person sheet

- **Implementation** picker (logos, grouped: OpenRouter models, then ready harnesses). Replaces Model `<select>`.
- **Fallback** only when implementation is OpenRouter.
- Chat titles, Soul, Skills, Rooms unchanged.

Storage on the bot (`.crew/bots/<id>/`):

```json
{ "model": "z-ai/glm-5.3-flash", "harness": null }
{ "model": "", "harness": "claude" }
```

`harness` is `null` \| `"claude"` \| `"codex"` \| `"grok"` \| `"opencode"`. Talk uses harness when set; otherwise `model` (else workspace default).

## Store

- OpenRouter key / baseUrl / allowed / default model / fallback: existing `.crew/config.json` + `~/.crew/config.json` merge. Add `defaultPermissionMode`, `autoCompact`, `reviewerModel`.
- Provider on/off + binary path: `.crew/providers.json` (not `config.json`, so a key PATCH cannot wipe it). Missing file = OpenRouter on, harnesses off.
- Always: `.crew/permissions.json` (already). Add POST that appends a rule; DELETE one rule by tool+key.
- Jobs: `.crew/jobs.json` (already).

## Picker

One component, two homes (Person, General default).

```
OpenRouter
  z-ai/glm-5.3-flash
  openai/gpt-4o-mini
Harnesses
  Claude    (logo)  Ready
  Codex     (logo)  Ready
  Grok      (logo)  Not installed  [disabled]
  OpenCode  (logo)  Ready
```

Empty OpenRouter whitelist and no ready harness → picker shows Default / Off as today.

## Slices (start only the first until the next is named)

**A — Settings complete, Crew runtime only.**  
Providers tab + move Models. General fields above. Permissions Add/delete/reviewer/default mode. About path. Person + General use the picker for **OpenRouter** (and show harness rows disabled or hidden until B). Auto-compact flag honored. No CLI spawn. ADR for providers.json + `harness` on the bot.

**B — Harness spawn, one CLI at a time.**  
Grok, then Claude, then Codex, then OpenCode. Each: detect, enable, picker Ready, turn runs that CLI, account still posts in the Crew channel. Own ADR per adapter if the port changes.

**C — MCP tab.**  
stdio servers in `.crew/mcp.json`. Tools on **Crew-native** turns. Harness MCP stays that CLI’s own config until we explicitly forward.

**Not this program:** plugins marketplace, exe (see `docs/todos/desktop-app.md`), remote, computer-use.

## Tests (slice A)

- Settings HTML has Providers tab, no leftover Models tab id (or Models panel gone).
- PUT providers roundtrip; PATCH config does not wipe `providers.json`.
- POST always-rule; DELETE one rule; list matches disk.
- New channel uses `defaultPermissionMode`.
- Auto-compact skipped when flag off.
- Person PATCH `harness: "claude"` stores; talk still uses OpenRouter until slice B (harness ignored or rejected if not wired — pick one and test it).
- Visual: Settings Providers cards; Person picker groups.
