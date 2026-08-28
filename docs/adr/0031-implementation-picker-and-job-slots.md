---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# Implementation picker is one component; Jobs slots use it too

## Context and Problem Statement

`ADR-0030` shipped Settings → Providers and `BotRecord.harness`, with spawn later. The Person field was still a native `<select>` of OpenRouter ids (and later, OpenRouter **vendor** groups). Codex/Claude catalogs came from `--help` and went stale. The picker sat behind the Settings `<dialog>` top layer. Jobs Compact / Vision / Read still picked a **person** (soul + that person's model). Title had a separate model list. There was no way to type a harness model id that the CLI did not list.

## Decision Drivers

- One searchable, logoed picker everywhere an implementation is chosen (Person, General default, Jobs Title / Compact / Vision / Read).
- Groups are Crew **providers** (All, OpenRouter, Claude, Codex, Grok, OpenCode), not OpenRouter vendor prefixes (`openai/…`).
- Picker rows come only from Settings → Providers: whitelist, enabled+installed harnesses, and that card's **custom models**.
- Jobs stay faceless workspace slots (`ADR-0029`). They are not People. They pick an implementation, not a rail person.
- Talk and one-shot jobs still use the Crew OpenRouter adapter until a harness spawn ADR. Storing `harness` must not break `@` turns.

## Considered Options

- Keep Compact/Vision/Read as a person `<select>` and only upgrade Person Model.
- Group OpenRouter rows by the vendor segment of the id (`anthropic/…`).
- Free-text model field next to every picker.
- Spawn the CLI when a Jobs slot is a harness (title a DM with Claude).

## Decision Outcome

Chosen option: **one implementation picker; Jobs write the same slot shape; custom models on the harness card; still no spawn.**

### Picker

- Search box, left rail **All** plus one row per provider (logo + name), right list of that group's models.
- OpenRouter rows = whitelist. Harness rows = `GET /api/providers/models` for that id (CLI list + fallbacks + `customModels`).
- A harness appears in the picker only when the card is **enabled** and health says **installed** (`ready`). Missing binary stays off the list even if Enable is checked.
- Picking OpenRouter stores `model` and clears `harness`. Picking a harness stores `harness` + `harnessModel` and leaves the previous OpenRouter `model` on the person (talk still uses it until spawn).
- The menu is portaled into the open `<dialog>` (Settings / Person sheet) so it is not painted under the top layer or clipped by sheet overflow. Switching Settings tabs closes it. The native `<select>` is visually hidden; the trigger is the picker chrome.

### Model lists

- Codex: `~/.codex/models_cache.json` when present, then current fallbacks (`gpt-5.6-sol` / `terra` / `luna`, `gpt-5.5`).
- Claude: aliases from `--help` plus current fallbacks (Sonnet / Opus / Haiku / Fable, `claude-*-4-6`, `claude-fable-5`).
- Grok: `grok models`. OpenCode: `opencode models`.
- Each harness card has **Custom models** (Add / chip remove). Ids persist on `HarnessSlot.customModels` and **prepend** that provider's list.
- Health (`GET /api/providers/health`): PATH + `--version` (3s). Also look in `%USERPROFILE%\.local\bin` (native Claude), `~\.claude\local`, npm global, WinGet Links, scoop shims. Recheck does not block bootstrap. Cache for `/api/providers/models` is 60s and cleared on `PUT /api/providers`.

### Jobs (`ADR-0029` qualified)

`.crew/jobs.json` slot:

```json
{ "model": "", "botId": null, "harness": null, "harnessModel": null }
```

- Title, Compact, Vision, and Read each use the **same picker** as Default model.
- Empty Title / Compact = workspace default. Empty Vision / Read = Off (skip).
- The UI writes `model` / `harness` / `harnessModel` and `botId: null`. `botId` remains valid on disk and HTTP: if set, `runJob` still wraps that person's Soul. Person sheet **Chat titles** is still that person's title model (empty = Jobs Title).
- Job **runtime** is still `provider.complete` (OpenRouter). A stored job `harness` is ignored until spawn, same as Person.

### Qualifies

- **0030** “Jobs stay OpenRouter (Title model; Compact/Vision/Read person soul + model)” — the **picker** is the implementation picker for all four slots. Runtime remains Crew/OpenRouter; spawn is still later.
- **0029** slot shape `{ model, botId }` — additive `harness` / `harnessModel`. Compact/Vision/Read UI is not a person picker.

### Consequences

- Good, because Person, Default, and Jobs do not grow four different widgets.
- Good, because a model the CLI forgot can be typed on the card once.
- Good, because Enable-if-installed works when Claude lives outside PATH.
- Bad, because a stored harness still does not change talk or jobs until slice B.
- Out of this ADR: spawning Claude/Codex/Grok/OpenCode, MCP tab, plugin marketplace, Electron.

### Confirmation

`apps/web/src/providers.ts` (`customModels`, `healthProviders`, `listAllProviderModels`, `readCodexModelCache`), `apps/web/src/jobs.ts` (`JobSlot.harness`), `apps/web/public/app.js` (`fillImplPicker`, `jobFromPicker`, `placePickerMenu`), Settings `#jobs-section` + `#prov-*`, `GET /api/providers/health`, `GET /api/providers/models`, `docs/specs/web-ui.md`.
