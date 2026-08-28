---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# Desktop shell is Tauri + WebView2 around the existing office

## Context and Problem Statement

The office is a local web UI (`bun run ui`, `ADR-0017`). Arda wants a **Crew.exe** window, not a browser tab, without Electron RAM. The engine (`apps/web` HTTP + `.crew` on disk) must not be rewritten. `crew serve` is still parked.

## Decision Drivers

- Native window, system WebView2 (Edge already on the machine).
- Same `/api/*` and `public/` as `bun run ui`.
- Project folder is cwd; last path remembered outside `.crew`.
- One window. Core stays I/O-free.

## Considered Options

- Electron / T3 desktop (bundled Chromium).
- Single `bun --compile` exe that opens the default browser.
- Tauri 2 window + compiled Bun sidecar (`crew-server.exe`).

## Decision Outcome

Chosen option: **Tauri 2 + WebView2 window wrapping the existing Bun.serve adapter.**

- `Crew.exe` (`apps/desktop`) picks/remembers a project folder, spawns `crew-server.exe` (`bun build --compile` of `apps/web`) with `--cwd`, loads `http://127.0.0.1:<port>` from sidecar stdout (`crew ui  http://127.0.0.1:N`).
- Last project: `%APPDATA%\Crew\last-project.json`. File → Open project… kills the sidecar and starts another. First-pick cancel = quit. Second Crew.exe focuses the running window.
- `bun run ui` remains. CLI remains tests/scripts. Not `crew serve`. Not Electron.

### Consequences

- Good, because the office UI and HTTP contract stay `apps/web`.
- Good, because RAM is Edge WebView2, not Chromium-in-the-box.
- Bad, because two processes (window + sidecar) and a Rust toolchain for the shell.
- Out of this ADR: macOS/Linux, MSI auto-update, tray, harness spawn.

### Confirmation

`apps/desktop/src-tauri`, `apps/web/src/argv.ts`, `bun run desktop`, `bun run desktop:build`, `docs/specs/web-ui.md`, `CHANGELOG.md`.
