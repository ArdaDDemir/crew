# Now — what is in, what is missing

Date: 2026-08-28  
Law: `AGENTS.md` + `docs/adr/`. This file is a snapshot, not a second spec.

Current release: **0.8.0**. Unreleased: human wins over soul/rules; identity history line; `dms show` unknown dm; patch excerpt; shell timeout line.

---

## In (0.8.0)

Held handoff (`ADR-0045`). Unknown `@` announced (`ADR-0046`). Inference-retry cannot claim unrun tools. History `[other bot, not you]`. DM pointer: last channel account may be stale.

See `CHANGELOG.md` `[0.8.0]`.

## In (0.7.0)

Honesty pack: fence `@`, `list_dir` skip, Jobs OpenRouter-only, forced empty account, harness tree-kill, MCP ask, conservative reviewer, shell lock, unread DM pointer, CLI `woke:` first, MCP `clientInfo.version` from `package.json`.

See `CHANGELOG.md` `[0.7.0]`.

## In (0.4.0)

Office UI + Crew.exe, People accordion, drag-split, Providers picker, Jobs, harness spawn (Grok/Claude/Codex/OpenCode), MCP stdio **and HTTP**, `crew say`/`crew dm` same bind, T3-shaped harness permission map (`ADR-0037`), Windows NSIS attempt on `desktop:build`.

See `CHANGELOG.md` `[0.4.0]`.

## In (0.6.0)

`dist/latest.json` from `desktop:build`; relative download URLs (`ADR-0040`). `GET /api/health` has `version`. DM permission mode (`ADR-0041`). `auto` reviewerModel (`ADR-0042`). `crew mode <dmId>`.

See `CHANGELOG.md` `[0.6.0]`.

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
| Discord API / `crew serve` / computer-use | Research: `docs/todos/discord-serve-computer-use-research.md`. Still no code until ADR-0047+ |
| Extra harnesses (Cursor, Amp) | Out |

NSIS: `dist/crew-windows-nsis/` (`Crew_0.8.0_x64-setup.exe`). MSI: `dist/crew-windows-msi/` (`Crew_0.8.0_x64_en-US.msi`). Portable: `dist/crew-windows/`. `dist/latest.json` is 0.8.0.
