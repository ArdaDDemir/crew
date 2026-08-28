# Crew.exe desktop shell

Date: 2026-08-28  
Status: **shipped (Windows portable)** — `bun run desktop` / `dist/crew-windows/Crew.exe`. Plan: `docs/superpowers/plans/2026-08-28-desktop-app.md`. ADR-0032.  
Owner: Arda  
ADR (with the code): **0032** — desktop window is a third adapter; core and `apps/web` HTTP stay.

Crew stays the office (channels, `@`, DMs, JSONL). The desktop shell is a **native window around the existing local UI**, not a rewrite, not Electron, not `crew serve`. UI copy English.

## What exists today

- Office: `bun run ui` → Bun.serve `127.0.0.1:7734` (`apps/web`). Browser tab.
- Same `.crew` as CLI. `startServer({ cwd, port, hostname, publicDir })`. Port 7734 busy → port `0`.
- Parked note: `docs/todos/desktop-app.md` (this spec replaces “do not start”).

## Product rules

1. Double-click **Crew.exe** opens a **native window** (WebView2 / system Edge). Not a browser tab. Not Chromium-in-the-box.
2. First launch: pick a **project folder**. That folder is cwd. `.crew` lives there. Remember it. **File → Open project…** switches (kills the engine, new cwd, reload). Cancel on first pick = quit.
3. Engine is the existing `apps/web` server, compiled as a sidecar. The window loads `http://127.0.0.1:<port>`. The browser never calls OpenRouter.
4. One Crew window. A second launch focuses the running one.
5. `bun run ui` stays for development. CLI stays tests/scripts.
6. Do not ship: Electron, MSI/auto-update/tray, macOS/Linux, `crew serve`, theme switcher, in-app browser, harness spawn.

## Architecture

Two processes:

```
Crew.exe          Tauri 2 + WebView2
  File menu, folder dialog, last-project.json
  spawn sidecar, read listening URL from stdout
  webview → http://127.0.0.1:<port>
  on quit / switch: kill sidecar

crew-server.exe   bun compile of apps/web
  Bun.serve + public/
  cwd = chosen folder
  127.0.0.1 only; prefer 7734 else ephemeral
```

Tauri does not reimplement `/api/*`. Sidecar does not open a window.

### Layout

```
apps/desktop/                 Tauri 2 project (window only)
  src-tauri/
    tauri.conf.json
    src/main.rs               spawn, menu, single-instance, last-project
    binaries/                 compiled sidecar (build output, gitignored)
apps/web/                     unchanged office, plus argv for cwd/port/publicDir
```

Root scripts (later, with the code): `bun run desktop` → `tauri dev`; `bun run desktop:build` → compile sidecar then `tauri build`.

### Sidecar argv

`crew-server.exe` / `bun run apps/web/src/server.ts`:

| Flag | Meaning |
|---|---|
| `--cwd <dir>` | project folder (default `process.cwd()`) |
| `--port <n>` | preferred port (default `CREW_UI_PORT` or 7734; busy → 0) |
| `--public <dir>` | static files (default: next to the exe `public/`, else `apps/web/public`) |
| `--hostname <host>` | default `127.0.0.1` |

Stdout **one** line, same family as today: `crew ui  http://127.0.0.1:7734`. Tauri parses the URL. No extra handshake file.

Compiled run copies `apps/web/public` next to `crew-server.exe` as `public/`. `import.meta.dir` is not trusted after `--compile`.

### Last project

`%APPDATA%\Crew\last-project.json`:

```json
{ "cwd": "C:\\Users\\Arda\\Desktop\\Projects\\aibuildingapp" }
```

- Missing, not a directory, or unreadable → folder picker.
- Written after a successful sidecar start (not before).
- Not inside the project `.crew` (the file answers “which project”).

### Window

- Title: `Crew`. Native decorations (not frameless).
- Default size 1280×800, minimum 900×600.
- Webview URL is only the sidecar’s `http://127.0.0.1:<port>/`.
- **File → Open project…** (same as switch). **File → Quit**.
- Close window = kill sidecar = exit.

### First launch / switch

1. If last `cwd` is a directory, start sidecar there.
2. Else native folder dialog. Cancel → quit (first launch) or keep current project (switch).
3. Switch: kill sidecar immediately (in-flight turn dies, no confirm), start sidecar with new cwd, reload webview, then write last-project.

### Single instance

`tauri-plugin-single-instance`. Second `Crew.exe` focuses the existing window. It does not start a second sidecar.

### Errors (English dialogs)

| Case | Copy |
|---|---|
| WebView2 runtime missing | `Crew needs Microsoft Edge WebView2 Runtime.` |
| Sidecar exit before a `crew ui` URL | `Could not start the office engine.` (+ short stderr if any) |
| Chosen path not a directory | picker again |

No retry loop that hides the dialog.

## Dev vs ship

| | Engine | Window |
|---|---|---|
| `bun run ui` | source `apps/web` | browser (unchanged) |
| `tauri dev` | `bun` + `--cwd` (not the compiled exe) | Crew.exe debug |
| `tauri build` | `bun build --compile` → sidecar + `public/` | shipped Crew.exe |

Windows only in this slice. Toolchain: Bun, Rust, Tauri CLI, WebView2 (Win 11 / current Edge usually already there).

## Tests

TDD on the engine flags, not on the GUI.

- `parseServerArgv`: `--cwd` / `--port` / `--public`; defaults. Unknown flags that start with `-` → throw (do not swallow typos).
- `startServer({ cwd })` uses that folder (existing host tests, plus argv main).
- Compiled `publicDir` helper: exe directory + `public`, not `import.meta.dir`.
- Sidecar stdout still matches `^crew ui  http://127\.0\.0\.1:\d+`.
- Last-project: invalid path → treat as missing (unit on the JSON shape if extracted; otherwise a tiny Rust test or a TS fixture the Tauri side mirrors).

No Playwright against Tauri in v1. Manual: double-click, pick this repo, Settings → About shows that cwd, Open project to another folder, second Crew.exe focuses.

`bun test` must stay green without Rust.

## Docs with the code

- `docs/adr/0032-desktop-webview-shell.md` (next number if 0032 is taken).
- `AGENTS.md`: local surface is `bun run ui` **or** Crew.exe; still not Electron; still not `crew serve`.
- `docs/specs/web-ui.md`: argv + desktop shell pointer.
- `CHANGELOG.md` `[Unreleased]`.
- `docs/todos/desktop-app.md`: status shipped / in progress, point at this spec + 0032.
- README: Crew.exe after build.

## Out of this spec

Harness spawn, MCP, plugins, installer, auto-update, tray, macOS/Linux, multiple windows, opening a system browser instead of WebView2.
