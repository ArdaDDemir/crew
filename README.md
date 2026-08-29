# Crew

Local multi-bot **office**. You own channels and people. `@id` wakes that bot; everyone else waits. They work at the desk (tools + thinking), then **account** in chat. Need-you is a stop. They may DM. You can read every DM.

**Surface:** `bun run ui` → [http://127.0.0.1:7734](http://127.0.0.1:7734) · or `bun run desktop` (**Crew.exe**, Tauri + WebView2)

**0.9.0.** CLI `crew` is tests/scripts on the same engine, not a TUI product.

## Requirements

- [Bun](https://bun.sh) 1.4+
- An [OpenRouter](https://openrouter.ai) API key (or any OpenAI-compatible `base_url`)
- Crew.exe (`bun run desktop`): [Rust](https://rustup.rs) 1.77+ and WebView2 (Windows 11 / current Edge)

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

Then open `http://127.0.0.1:7734`, or `bun run desktop` for the Crew.exe window. After `bun run desktop:build`, double-click `dist/crew-windows/Crew.exe`. NSIS/MSI land in `dist/crew-windows-nsis/` and `dist/crew-windows-msi/` when those tools are installed. Hard-refresh (**Ctrl+F5**) after UI pulls in the browser.

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
| Crew.exe | Native window (`bun run desktop`); not Electron |
| Split panes | Drag a chat to the right, or the grip; max two in-page panes |
| People | Click a person to expand their chats; Direct is bot↔bot |
| Composer | Enter sends; `@path` from disk; `/help` `/compact` `/status` … |
| Jobs | Settings → Title / Compact / Vision / Read (implementation picker, not extra People) |
| Providers | Settings → OpenRouter + Claude / Codex / Grok / OpenCode. Enable a card → that Person’s turn **spawns the CLI** |
| MCP | Settings → MCP stdio/HTTP servers; tools, resources, and prompts on OpenRouter turns (`mcp_<server>_…`) |
| Compact | Last 80 messages + trim + LLM `thread.summary`; JSONL is never rewritten |

Default permission is **auto-accept** (workspace file writes + workspace shell). `.env` and `~/.ssh` are always denied.

## Docs

Agents (and humans writing agents) start at [`AGENTS.md`](./AGENTS.md).

| | |
|---|---|
| Map | [`docs/README.md`](docs/README.md) |
| Decisions | [`docs/adr/`](docs/adr/) (0001–0036) |
| Now / gaps | [`docs/todos/now.md`](docs/todos/now.md) |
| UI contract | [`docs/specs/web-ui.md`](docs/specs/web-ui.md) |
| Versions | [`docs/versioning.md`](docs/versioning.md) · [`CHANGELOG.md`](CHANGELOG.md) |
| Contributing | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

Stack: TypeScript + Bun. Hexagonal core (`packages/core` has no fetch/UI). Logs: `.crew/logs/*.jsonl` (append-only). Always: `.crew/permissions.json`. Humans: `.crew/humans.json`. Jobs: `.crew/jobs.json`. Providers: `.crew/providers.json`. MCP: `.crew/mcp.json`. User key: `~/.crew/config.json`.

## Not this

Electron, Discord API, T3 plugin marketplace, git auto-PR, `crew serve`, computer-use, in-app browser. Desktop window is Tauri + WebView2. MCP is in (`ADR-0036`–`0038`). Parked notes: `docs/todos/` (status: `docs/todos/now.md`).
