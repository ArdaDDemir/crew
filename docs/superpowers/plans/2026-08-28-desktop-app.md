# Crew.exe desktop shell Implementation Plan

> **For agentic workers:** Inline execution in this session (`başla`). TDD. No Electron. No `crew serve`. Do not commit unless Arda asks.

**Goal:** Double-click Crew.exe opens a native WebView2 window around the existing `apps/web` office, with a remembered project folder.

**Architecture:** Tauri 2 window (`Crew.exe`) spawns compiled Bun sidecar (`crew-server.exe`) with `--cwd`. Webview loads `http://127.0.0.1:<port>` from sidecar stdout. Last path in `%APPDATA%\Crew\last-project.json`. Core unchanged.

**Tech Stack:** TypeScript, Bun, Tauri 2, Rust, WebView2. Windows only.

**Spec:** `docs/superpowers/specs/2026-08-28-desktop-app-design.md`

## Global Constraints

- UI copy English. Dialogs: `Crew needs Microsoft Edge WebView2 Runtime.` / `Could not start the office engine.`
- Sidecar stdout: `crew ui  http://127.0.0.1:<port>`
- Hostname `127.0.0.1` only. Prefer port 7734 else 0.
- One window; second launch focuses. Switch project kills sidecar, no confirm.
- `bun test` stays green without Rust. `bun run ui` unchanged.
- ADR-0032 with the code. Not Electron. Not `crew serve`.

## Files

| Path | Role |
|---|---|
| `apps/web/src/argv.ts` | `parseServerArgv`, `flagsFromArgv`, `resolvePublicDir` |
| `apps/web/src/argv.test.ts` | failing tests first |
| `apps/web/src/server.ts` | `import.meta.main` uses argv |
| `apps/desktop/src-tauri/*` | Tauri window, spawn, menu, last-project |
| `apps/desktop/splash/index.html` | brief Starting… until navigate |
| `scripts/build-desktop.ts` | compile sidecar + copy public + tauri build |
| `docs/adr/0032-desktop-webview-shell.md` | decision |
| docs/CHANGELOG/AGENTS/README/web-ui/todos | surface |

---

### Task 1: Sidecar argv + publicDir

**Files:** Create `apps/web/src/argv.ts`, `apps/web/src/argv.test.ts`. Modify `apps/web/src/server.ts` `import.meta.main`.

**Produces:** `parseServerArgv(argv: string[]): ServerArgv`, `flagsFromArgv(argv: string[]): string[]`, `resolvePublicDir(...)`.

- [ ] Failing tests in `argv.test.ts` (parse flags, unknown `-` throws, bun vs compiled slice, `$bunfs` publicDir, startServer cwd in bootstrap).
- [ ] Implement `argv.ts`; wire `startServer(parse...)`.
- [ ] `bun test apps/web/src/argv.test.ts apps/web/src/server.test.ts`

### Task 2: Tauri shell

**Files:** `apps/desktop/` Tauri 2 project. Spawn bun (dev) or `crew-server.exe` (release). File menu. last-project. single-instance. rfd dialogs.

- [ ] Scaffold `src-tauri` + splash.
- [ ] last-project JSON load/save; invalid path = missing.
- [ ] Parse `crew ui  http://127.0.0.1:N` from stdout; timeout/fail → English dialog.
- [ ] `.gitignore` `src-tauri/target/` and `binaries/`.
- [ ] `package.json` scripts `desktop` / `desktop:build`.

### Task 3: Docs

- [ ] ADR-0032, AGENTS (Crew.exe allowed; still not Electron), CHANGELOG, web-ui argv, README, todos/desktop-app.md, spec status in progress/shipped.

---
