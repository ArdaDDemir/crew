---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# Opt-in update check and Crew.exe tray

## Context and Problem Statement

After 0.4.0 the leftover desktop items were auto-update, tray, macOS/Linux. There is no public CDN or GitHub release URL on this machine. Silent self-update would need signing keys in the repo. Close on Crew.exe currently destroyed the window and killed the engine.

## Decision Drivers

- No silent install. No bundled marketplace. No required internet.
- Core stays I/O-free; HTTP lives in `apps/web`.
- Unit tests never hit a real update host.
- Close should not drop an in-flight desk turn; Quit is explicit.

## Considered Options

- Tauri updater plugin + committed private key + invented GitHub URL.
- Ignore updates until a CDN exists.
- About-tab **Check for updates** against a user-set HTTPS JSON URL; Crew.exe **hide to tray**, Quit from the tray menu.

## Decision Outcome

Chosen option: **opt-in check + tray hide.**

- `updateUrl` lives in `~/.crew/config.json` (and `CREW_UPDATE_URL`). Not project `.crew/config.json`. https only; http only on localhost.
- Manifest: `{ version, notes, url }` or Tauri `platforms.windows-x86_64.url`. Crew compares to root `package.json` version. Newer → About shows Download (opens the URL). Crew does **not** write over Crew.exe.
- Empty URL → check returns `disabled`. Dead/invalid JSON → `error`.
- Crew.exe: Close / × **hides** the window. Tray: Show Crew, Open project, Quit (kills sidecar). Left-click tray restores.
- Not this ADR: auto-download, code-signing, macOS/Linux bundles, a public Crew release CDN.

### Consequences

- Good, because a human can wire GitHub Releases later without a core change.
- Bad, because nobody is notified until they click Check.
- Bad, because hide-to-tray means × is not exit (Quit is).

### Confirmation

`apps/web/src/update.ts`, Settings About, `apps/desktop/src-tauri/src/main.rs` tray, CHANGELOG `[Unreleased]`.
