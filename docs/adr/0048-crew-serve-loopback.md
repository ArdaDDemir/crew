---
status: accepted
date: 2026-08-29
decision-makers: Arda
---

# `crew serve` is the loopback office daemon

## Context and Problem Statement

`ADR-0047` gave humans ids and invite hashes. The office still starts only as `bun run ui`. Extra humans must put `token` in the JSON body. A second origin has no CORS. Research wanted serve C/D next; Discord.js and `0.0.0.0` are still not this ADR.

## Decision Outcome

Qualifies `ADR-0017`, `ADR-0047`. CLI stays tests/scripts (`docs/todos/cli-is-script.md`); this command is the HTTP daemon, not a TUI.

1. `crew serve` starts the same `apps/web` office. Flags: `--cwd`, `--port`, `--public`, `--hostname`, `--cors`. Stdout stays `crew ui  http://127.0.0.1:<port>`.
2. `--hostname` is still loopback only (`127.0.0.1` / `localhost`). Not `0.0.0.0`.
3. Invite token: `Authorization: Bearer <token>` or JSON `token`. Bearer wins. Missing token on loopback is the owner. Invalid token is HTTP 401 `{ error: "invalid invite" }`.
4. `--cors <origin>` is opt-in. When set, OPTIONS is 204 and responses get `Access-Control-Allow-Origin` plus `Authorization` / `Content-Type`. Default: same-origin, no extra CORS.
5. Not this ADR: Discord Gateway, public bind, Tailscale/Caddy, rewriting JSONL.

### Confirmation

`apps/web` argv + `/api/say`, `apps/cli` `serve`, CHANGELOG `[Unreleased]`.
