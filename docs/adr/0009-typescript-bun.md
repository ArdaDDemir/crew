---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# TypeScript + Bun

## Context and Problem Statement

Windows-first, TDD-first, OpenRouter, later a web/desktop UI.

## Considered Options

- TypeScript + Bun
- Rust + ratatui
- Go + Bubble Tea

## Decision Outcome

Chosen option: "TypeScript + Bun", because the inner test loop on Windows does not need MSVC, OpenRouter’s ecosystem is TS, and a later UI is web. Core stays I/O-free so a Rust rewrite remains possible (Codex did that after a TS v1).

Runtime: Bun. Target terminal: Windows Terminal. cmd.exe is unsupported.

v1 CLI is a streaming REPL, not a fullscreen TUI.

### Consequences

- Good, because TDD and OpenRouter are fast
- Bad, because the binary is not a 5 MB native exe

### Confirmation

Root `package.json` `packageManager` bun. `bun test` is the default test command.
