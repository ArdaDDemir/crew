# Crew

Local multi-bot **office**. You own channels and people. `@id` wakes that bot; everyone else waits. They work at the desk (tools + thinking), then **account** in chat. Need-you is a stop. They may DM. You can read every DM.

**Surface:** `bun run ui` → [http://127.0.0.1:7734](http://127.0.0.1:7734)

**0.3.0.** CLI `crew` is tests/scripts on the same engine, not a TUI product.

## Requirements

- [Bun](https://bun.sh) 1.4+
- An [OpenRouter](https://openrouter.ai) API key (or any OpenAI-compatible `base_url`)

## Quick start

```bash
git clone <this-repo>
cd aibuildingapp
bun install
bun test
```

Windows (PowerShell):

```powershell
$env:OPENROUTER_API_KEY="sk-or-..."
bun run crew -- config set key $env:OPENROUTER_API_KEY
bun run ui
```

Then open `http://127.0.0.1:7734`. Hard-refresh (**Ctrl+F5**) after UI pulls.

Optional: seed people/rooms from the CLI (same `.crew` as the UI):

```powershell
bun run crew -- bot create lead --name Lead
bun run crew -- bot create coder --name Coder
bun run crew -- channel create landing --bots lead,coder --lead lead
```

## What you get

| In the office | How |
|---|---|
| Channels + People + Direct | Discord-like rail; many DMs per person |
| Jump | Ctrl/Cmd+K |
| Context menu | Right-click → Open / Open to the right / below |
| Split panes | Max two, in-page (not Electron windows) |
| Composer | Enter sends; `@path` from disk; `/help` `/compact` `/status` … |
| Jobs | Settings → Title / Compact / Vision / Read (not extra People) |
| Compact | Last 80 messages + trim + LLM `thread.summary`; JSONL is never rewritten |

Default permission is **auto-accept** (workspace file writes + workspace shell). `.env` and `~/.ssh` are always denied.

## Docs

Agents (and humans writing agents) start at [`AGENTS.md`](./AGENTS.md).

| | |
|---|---|
| Map | [`docs/README.md`](docs/README.md) |
| Decisions | [`docs/adr/`](docs/adr/) (0001–0029) |
| UI contract | [`docs/specs/web-ui.md`](docs/specs/web-ui.md) |
| Versions | [`docs/versioning.md`](docs/versioning.md) · [`CHANGELOG.md`](CHANGELOG.md) |
| Contributing | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

Stack: TypeScript + Bun. Hexagonal core (`packages/core` has no fetch/UI). Logs: `.crew/logs/*.jsonl` (append-only). Always rules: `.crew/permissions.json`. User key: `~/.crew/config.json`.

## Not this

Electron, Discord API, MCP, git auto-PR, `crew serve`, computer-use, in-app browser. Parked notes: `docs/todos/`.
