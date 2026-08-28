---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# MCP stdio servers add tools on Crew-native turns

## Context and Problem Statement

Slice C of the Providers design: Settings needs an MCP tab. Harness CLIs already have their own MCP configs; Crew-native (OpenRouter) turns had only `read` / `apply_patch` / `list_dir` / `shell` / org / `dm_send`. Arda asked to start MCP / plugins. The T3 plugin marketplace stays out. MCP stdio servers are the integration.

## Decision Drivers

- Core stays I/O-free; spawn lives in `apps/web`.
- Tools attach only to **Crew-native** turns. Harness spawn does not get Crew-forwarded MCP (`ADR-0034`/`0035`).
- Unit tests never talk to a real marketplace; stdio is faked or a local echo script.
- Config must not live in `config.json` (same reason as providers/jobs).

## Considered Options

- T3 plugin marketplace.
- Forward Crew MCP into Grok/Claude/Codex/OpenCode argv.
- `.crew/mcp.json` + JSON-RPC stdio client, tools injected into `runBotTurn`.

## Decision Outcome

Chosen option: **`.crew/mcp.json` + Settings MCP tab + stdio JSON-RPC on OpenRouter turns.**

- File: `{ servers: [{ name, enabled, command, args, env }] }`. Name is a slug. Max 8 servers. Missing file = no servers.
- `GET`/`PUT /api/mcp`. `GET /api/mcp/tools` lists live tools (best-effort; failures skip that server).
- Client: MCP initialize + `tools/list` + `tools/call` over stdio (`Content-Length` framing, NDJSON accepted). Tool names in Crew: `mcp_<server>_<tool>` (dots → `_`).
- `sayChannel` / `sendDm` prepend those tools onto the Crew tool list. Supervised still asks (unknown tools map to `shell`). Auto-accept allows them. Always fingerprints apply if the human hits Always.
- Connect per say; close after. A dead server is skipped, the turn still runs.
- Not this ADR: plugin marketplace, forwarding MCP into harness CLIs, remote MCP HTTP.

### Consequences

- Good, because OpenRouter people can call filesystem/github/etc. MCP tools and still account in the channel.
- Bad, because harness people only see MCP if that CLI is configured itself.
- Bad, because auto-accept MCP is as wide as auto-accept shell.

### Confirmation

`apps/web/src/mcp.ts`, `apps/web/src/mcp-client.ts`, Settings `#mcp-section`, CHANGELOG `[Unreleased]`, `docs/specs/web-ui.md`.
