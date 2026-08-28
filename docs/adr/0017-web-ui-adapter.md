---
status: accepted; live office qualified by ADR-0020
date: 2026-08-27
decision-makers: Arda
---

# Local web UI is a second adapter on the same core

## Context and Problem Statement

v1 CLI is done. The product needs per-bot bubbles, DMs, and a composer. Electron is not required to start. The core already has events.

## Decision Outcome

`apps/web`: Bun.serve on localhost. HTTP JSON + NDJSON streams. Static UI. Same `dispatchChannelPost` / `dispatchDm` / JSONL / FsWorkspace as the CLI.

- Not Electron in this slice.
- Core still has no HTTP.
- UI talks to the engine, never to OpenRouter directly.

### Confirmation

`apps/web/src/server.ts`, `bun run ui`.
