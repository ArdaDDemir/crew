# Now — what is in, what is missing

Date: 2026-08-28  
Law: `AGENTS.md` + `docs/adr/`. This file is a snapshot, not a second spec.

Current release: **0.5.0**.

---

## In (0.4.0)

Office UI + Crew.exe, People accordion, drag-split, Providers picker, Jobs, harness spawn (Grok/Claude/Codex/OpenCode), MCP stdio **and HTTP**, `crew say`/`crew dm` same bind, T3-shaped harness permission map (`ADR-0037`), Windows NSIS attempt on `desktop:build`.

See `CHANGELOG.md` `[0.4.0]`.

## In ([Unreleased])

`dist/latest.json` from `desktop:build`; relative download URLs (`ADR-0040`). `GET /api/health` has `version`. DM permission mode (`ADR-0041`).

## In (0.5.0)

MCP **resources/prompts** as Crew tools (`ADR-0038`). `desktop:build` also tries a **MSI**. Opt-in About **Check for updates** + Crew.exe **tray** (`ADR-0039`).

See `CHANGELOG.md` `[0.5.0]`.

---

## Still later

| Item | Why |
|---|---|
| Signed auto-install | Needs a public CDN + signing private key. Host `dist/latest.json` and paste its URL in About |
| macOS / Linux bundles | We only build on this Windows machine |
| T3 plugin marketplace | Out. MCP is the integration |
| Discord API / `crew serve` / computer-use | Parked `docs/todos/` |
| Extra harnesses (Cursor, Amp) | Out |

NSIS installer: `dist/crew-windows-nsis/` (`Crew_0.5.0_x64-setup.exe`). MSI: `dist/crew-windows-msi/` (`Crew_0.5.0_x64_en-US.msi`). Tauri can download NSIS/WiX into the build cache. Portable folder `dist/crew-windows/` always.
