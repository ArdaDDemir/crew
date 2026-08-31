---
status: accepted
date: 2026-08-31
decision-makers: Arda
---

# Updates: GitHub Releases feed, assisted install, signed silent updater

## Context and Problem Statement

`ADR-0039` made the update check **opt-in**: empty `updateUrl` disabled it, and "Download" only opened a browser tab. `dist/latest.json` had to be hand-hosted on some HTTPS URL. Nothing auto-updated. Arda asked for GitHub-based auto-update — including silent install.

## Decision Outcome

Amends `ADR-0039` (the opt-in default is replaced; tray and `latest.json` manifest work stand).

1. **Feed = GitHub Releases by default.** When `updateUrl` is empty and `autoUpdate` is not false, the check hits `https://api.github.com/repos/ArdaDDemir/crew/releases/latest` (unauth; 60 req/h is plenty for a boot check). `update.ts` parses both formats: the existing `{version, notes, url|platforms}` manifest **and** the GitHub API response (`tag_name` → version, `body` → notes, assets → download URL, NSIS preferred, then MSI, then portable zip). A custom `updateUrl` still wins and may stay disabled.
2. **Assisted install.** `POST /api/update-install` streams the chosen Windows asset to `%TEMP%` and launches it detached. UAC / SmartScreen still gate the unsigned exe. The About button becomes **Install <version>** with a progress label.
3. **Signed silent updater (desktop only).** `tauri-plugin-updater` (+ `tauri-plugin-process` for relaunch) with `createUpdaterArtifacts: true`. The minisign **private key lives outside the repo** (`~/.tauri/crew-updater.key`, empty passphrase); only the public key is committed in `tauri.conf.json`. `desktop:build` signs the bundles (`.sig` artifacts), generates the Tauri updater manifest (`version`, `notes`, `pub_date`, `platforms["windows-x86_64"] { signature, url }`) from the `.sig` files, and the release uploads installer, `.sig` files, portable zip, and that `latest.json`. The stable endpoint is `https://github.com/ArdaDDemir/crew/releases/latest/download/latest.json`.
4. **Client preference**: in the desktop shell (`window.__CREW_DESKTOP__`) the update flow uses the Tauri updater (silent download, verify, install, relaunch). In the plain web office (`bun run ui`) it uses `/api/update-install`. Boot check is throttled to once per 24h (`localStorage crew.updateAt`).

Not this ADR: delta updates, macOS/Linux bundles, CI-driven releases.

### Confirmation

TDD: GitHub-API manifest parse, effective-feed resolution, update-check default, install endpoint shape. Signed artifacts verified by `desktop:build` producing `.sig` + updater `latest.json`.
