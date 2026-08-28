---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# `desktop:build` writes `dist/latest.json`; relative download URLs

## Context and Problem Statement

`ADR-0039` made About **Check for updates** fetch a JSON URL. There was no file to host, and the parser only accepted absolute `http(s)` download links. There is still no Crew CDN. Arda asked to keep going so a GitHub Release (or any static host) can work later.

## Decision Drivers

- Do not invent a GitHub repo or commit signing keys.
- One JSON shape for humans and for Tauri-style `platforms`.
- Unit tests never fetch a real host.

## Decision Outcome

- `bun run desktop:build` writes `dist/latest.json` `{ version, notes, url, platforms }`. `url` prefers the MSI filename. Notes come from that version’s CHANGELOG bullets. Optional `CREW_RELEASE_BASE` prefixes absolute URLs.
- Check-for-updates resolves a relative `url` against the `latest.json` location (`https://host/dir/latest.json` + `Crew_0.5.0_x64_en-US.msi` → `https://host/dir/Crew_0.5.0_x64_en-US.msi`).
- Still no silent install. The human pastes the hosted `latest.json` URL into About.
- Not this ADR: publishing the GitHub Release, code-signing, auto-download.

### Confirmation

`apps/web/src/update.ts` `parseUpdateManifest` / `writeReleaseManifest`, `scripts/build-desktop.ts`, CHANGELOG `[Unreleased]`.
