---
status: accepted
date: 2026-08-29
decision-makers: Arda
---

# Isolated browser tools; not the live desktop

## Context and Problem Statement

Bots have file and shell hands. They cannot open a page. Full desktop mouse is unsafe on this Windows session. Playwright MCP is an MCP server; Crew already asks for `mcp_*`. Native `browser_*` tools need their own kind so they are not auto-accept **shell**.

## Decision Outcome

Qualifies `ADR-0007`, `ADR-0011`, `ADR-0044`.

1. `ToolKind` `browser`. Names `browser_open`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_screenshot`. Auto-accept **asks** (same as `mcp`). `full-access` allows.
2. Always deny `file://`, `chrome://`, `chrome-extension://`, `javascript:`, `about:`, `data:`, and URLs whose path looks like `.env`. Reviewer is skipped (like hard-deny shell).
3. One browser per workspace. Live profile `.crew/browser/` (Playwright Chromium when installed). Tests inject a memory driver. No default Chrome profile, no live desktop mouse.
4. Screenshots are desk tool results (path under `.crew/browser/shots/`), not the channel account.
5. Not this ADR: `SendInput` on the interactive desktop, Playwright MCP as the only path, Discord, `0.0.0.0`.

### Confirmation

`packages/core` permissions/turn, `packages/tools-native` browser tools, CHANGELOG `[Unreleased]`.
