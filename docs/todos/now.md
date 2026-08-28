# Now — what is in, what is missing

Date: 2026-08-28  
Law: `AGENTS.md` + `docs/adr/`. This file is a snapshot, not a second spec.

Current release: **0.4.0**.

---

## In (0.4.0)

Office UI + Crew.exe, People accordion, drag-split, Providers picker, Jobs, harness spawn (Grok/Claude/Codex/OpenCode), MCP stdio **and HTTP**, `crew say`/`crew dm` same bind, T3-shaped harness permission map (`ADR-0037`), Windows NSIS attempt on `desktop:build`.

See `CHANGELOG.md` `[0.4.0]`.

---

## Still later

| Item | Why |
|---|---|
| Auto-update | Needs a public endpoint + signing keys |
| macOS / Linux bundles | We only build on this Windows machine |
| MSI | WiX; NSIS is the Windows installer we try |
| T3 plugin marketplace | Out. MCP is the integration |
| MCP resources/prompts | Tools only |
| Discord API / `crew serve` / computer-use | Parked `docs/todos/` |
| Extra harnesses (Cursor, Amp) | Out |

NSIS installer appears under `dist/crew-windows-nsis/` only if NSIS is installed when you run `bun run desktop:build`. Portable zip-folder `dist/crew-windows/` always.
