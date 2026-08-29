# Docs map

Law: repo-root [`AGENTS.md`](../AGENTS.md). If a file here disagrees, AGENTS + `adr/` win.

| Path | What |
|---|---|
| [adr/](adr/) | Decisions 0001–**0036** (immutable once accepted; qualify/supersede, do not rewrite) |
| [specs/bots-and-channels.md](specs/bots-and-channels.md) | Bot / channel fields; reserved ids; `harness` |
| [specs/mentions-and-routing.md](specs/mentions-and-routing.md) | Scheduler: `@` wake, one turn per `say` |
| [specs/session-jsonl.md](specs/session-jsonl.md) | Append-only events, `thread.compacted` / `thread.summary` / `thread.titled` |
| [specs/permissions.md](specs/permissions.md) | Four modes, Always, hard denials |
| [specs/skills.md](specs/skills.md) | Agent Skills `SKILL.md` |
| [specs/cli.md](specs/cli.md) | `crew` commands and `/` REPL |
| [specs/web-ui.md](specs/web-ui.md) | `bun run ui` / Crew.exe, HTTP, office chrome, Providers, picker, MCP |
| [specs/provider.md](specs/provider.md) | `complete()` port + harness spawn |
| [specs/edge-cases.md](specs/edge-cases.md) | Catalog; fixed items point at ADRs |
| [versioning.md](versioning.md) | 0.x semver. Current **0.8.0**; newer work is `[Unreleased]` |
| [todos/now.md](todos/now.md) | **Current snapshot + gaps** |
| [todos/multi-human-remote.md](todos/multi-human-remote.md) | Parked: `crew serve` |
| [todos/computer-use-and-browser.md](todos/computer-use-and-browser.md) | Parked: computer-use + in-app browser |
| [todos/discord-serve-computer-use-research.md](todos/discord-serve-computer-use-research.md) | Research: Discord adapter, `crew serve`, browser/computer-use. No code until ADR-0047+ |
| [todos/cli-is-script.md](todos/cli-is-script.md) | CLI is tests/scripts, not a TUI product |
| [todos/desktop-app.md](todos/desktop-app.md) | Crew.exe shipped; installer later (`ADR-0032`) |
| [superpowers/specs/](superpowers/specs/) | Product “why”. Settings/Providers/MCP: `2026-08-28-settings-providers-design.md`. Desktop: `2026-08-28-desktop-app-design.md` |

Start: `AGENTS.md` → this map → the spec you are changing. New architecture: next ADR number in `adr/README.md`.
