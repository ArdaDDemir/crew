---
status: accepted
date: 2026-08-28
decision-makers: Arda
---

# MCP resources and prompts become Crew tools

## Context and Problem Statement

`ADR-0036` / `ADR-0037` attach MCP **tools** (`tools/list` + `tools/call`) to Crew-native turns. MCP also has **resources** and **prompts**. Arda asked to finish leftover MCP surface after 0.4.0. A plugin marketplace stays out.

## Decision Drivers

- Core stays I/O-free; JSON-RPC stays in `apps/web`.
- Same `mcp_<server>_…` naming as tools.
- A server that only has resources must not die because `tools/list` errors.
- Unit tests never talk to a marketplace; stdio is the echo fixture or a scripted RPC.

## Considered Options

- Ignore resources/prompts (tools only).
- Embed resource URIs in the system prompt at connect time.
- Extra Crew tools that call `resources/list|read` and `prompts/list|get` when initialize advertises those capabilities.

## Decision Outcome

Chosen option: **capability-gated Crew tools.**

- After `initialize`, if `capabilities.resources` is present, add `mcp_<server>_resources_list` and `mcp_<server>_resources_read` (`uri` required).
- If `capabilities.prompts` is present, add `mcp_<server>_prompts_list` and `mcp_<server>_prompts_get` (`name` required; other args become MCP `arguments`).
- Do not call list at connect time. Execute hits the JSON-RPC method.
- `tools/list` failure → empty tool defs, session continues (resources/prompts-only servers).
- Still Crew-native turns only. Dead servers skipped. Cap 32 Crew tools. Harness people keep `--mcp-config`.
- Not this ADR: plugin marketplace, MCP sampling/roots, auto-subscribe.

### Consequences

- Good, because docs/prompt servers work on OpenRouter turns without a fake MCP tool wrapper.
- Bad, because four extra names compete with the 32-tool cap.
- Bad, because auto-accept still treats these like unknown = shell.

### Confirmation

`apps/web/src/mcp-client.ts` `openMcpSession`, `apps/web/src/mcp-echo-server.ts`, CHANGELOG `[Unreleased]`, `docs/specs/web-ui.md`.
