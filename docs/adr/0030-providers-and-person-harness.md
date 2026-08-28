---
status: accepted; qualified by 0031, 0034
date: 2026-08-28
decision-makers: Arda
---

# Providers tab feeds the Person picker; harness spawn is later

## Context and Problem Statement

Settings Models was OpenRouter-only. The office needs a T3-shaped **Providers** list (OpenRouter + Claude / Codex / Grok / OpenCode) so the Person implementation picker can list only what is enabled. Always rules could not be added from Settings. Workspace flags (default room mode, auto-compact, reviewer, base URL) lived only in env/files.

## Decision Drivers

- Crew stays the engine for slice A (OpenRouter talk, our tools).
- Picker contents come from Settings → Providers, not a second free-text field.
- `config.json` PATCH must not wipe provider on/off flags (same reason as jobs.json).
- Harness CLIs are optional and detected; spawning them is a later slice.

## Considered Options

- Keep Models tab and add harnesses as extra People.
- One `config.json` blob for key, models, and harness flags.
- `.crew/providers.json` + `BotRecord.harness`, talk ignores harness until an adapter exists.

## Decision Outcome

Chosen option: **Providers file + harness field, no spawn yet.**

- Settings tabs: General, **Providers** (replaces Models), Jobs, Permissions, About.
- `.crew/providers.json`: OpenRouter on by default; Claude/Codex/Grok/OpenCode off. Optional binary path. `GET`/`PUT /api/providers`.
- Person `harness` is `null` or `claude|codex|grok|opencode`. Talk still uses `model` / workspace default until a harness adapter ships.
- Jobs stay OpenRouter (Title model; Compact/Vision/Read person soul + model).
- Always: `POST /api/permissions` adds a fingerprint; `DELETE /api/permissions?tool=&key=` removes one row.
- Workspace flags in project `config.json`: `defaultPermissionMode`, `autoCompact`, `reviewerModel`, `baseUrl`.

### Consequences

- Good, because the picker and cards can ship before CLI spawn.
- Good, because enabling Grok does not break `@coder` turns today.
- Bad, because a stored `harness` does not change runtime until slice B.

### Confirmation

`apps/web/src/providers.ts`, `docs/specs/web-ui.md`, Settings `#prov-openrouter` / `#prov-claude` / `#prov-codex` / `#prov-grok` / `#prov-opencode`, `BotRecord.harness`.
