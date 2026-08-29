# Now — what is in, what is missing

Date: 2026-08-29  
Law: `AGENTS.md` + `docs/adr/`. This file is a snapshot, not a second spec.

Current release: **0.9.0**. Unreleased: (empty). Parks: public `0.0.0.0`, live desktop mouse, signed auto-install, macOS/Linux.

---

## In (0.9.0)

Human ids (`ADR-0047`). Loopback `crew serve` (`ADR-0048`). Discord adapter (`ADR-0049`–`0053`). Browser tools (`ADR-0050`). Invite chip / live shot / Discord queue / Playwright (`ADR-0054`). Guest cannot write the office (`ADR-0055`). 2.5D floor, walk, doors, furniture, looks (`ADR-0056`–`0060`). Human wins over soul/rules; identity history line; `dms show` unknown dm; patch excerpt; shell timeout line.

See `CHANGELOG.md` `[0.9.0]`.

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
| Public bind / live desktop mouse | Research: `docs/todos/discord-serve-computer-use-research.md`. Browser tools are in (`ADR-0050`). `0.0.0.0` and interactive-desktop mouse still parked |
| Extra harnesses (Cursor, Amp) | Out |

NSIS/MSI/portable under `dist/` are rebuilt by `bun run desktop:build`. Last built artifacts on this machine may still say 0.8.0 until that runs for 0.9.0.
