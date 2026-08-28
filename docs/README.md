# Docs map

Law: repo-root [`AGENTS.md`](../AGENTS.md). If a file here disagrees, AGENTS + `adr/` win.

| Path | What |
|---|---|
| [adr/](adr/) | Decisions 0001–0029 (immutable once accepted) |
| [specs/bots-and-channels.md](specs/bots-and-channels.md) | Bot / channel fields; reserved ids |
| [specs/mentions-and-routing.md](specs/mentions-and-routing.md) | Scheduler: `@` wake, one turn per `say` |
| [specs/session-jsonl.md](specs/session-jsonl.md) | Append-only events, `thread.compacted` / `thread.summary` / `thread.titled` |
| [specs/permissions.md](specs/permissions.md) | Four modes, Always, hard denials |
| [specs/skills.md](specs/skills.md) | Agent Skills `SKILL.md` |
| [specs/cli.md](specs/cli.md) | `crew` commands and `/` REPL |
| [specs/web-ui.md](specs/web-ui.md) | `bun run ui`, HTTP, office chrome |
| [specs/provider.md](specs/provider.md) | `complete()` port |
| [specs/edge-cases.md](specs/edge-cases.md) | Catalog; fixed items point at ADRs |
| [versioning.md](versioning.md) | 0.x semver. Current **0.3.0**; newer work is `[Unreleased]` |
| [todos/multi-human-remote.md](todos/multi-human-remote.md) | Parked: `crew serve` |
| [todos/computer-use-and-browser.md](todos/computer-use-and-browser.md) | Parked: computer-use + in-app browser |
| [todos/cli-is-script.md](todos/cli-is-script.md) | CLI is tests/scripts, not a TUI product |
| [superpowers/specs/](superpowers/specs/) | Product “why” (CLI-first origin; office UI is the surface) |

Start: `AGENTS.md` → this map → the spec you are changing. New architecture: next ADR number in `adr/README.md`.
