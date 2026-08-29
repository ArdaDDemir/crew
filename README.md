# Crew

Local multi-bot **office**. You own the channels and the people. `@coder` wakes that person; everyone else waits. They work at their desk (tools + thinking), then **give an account** in the channel. If they need you, they stop. They may DM. You can read every DM.

Windows installer is on [Releases](https://github.com/ArdaDDemir/crew/releases/latest). Loopback only. Not a Discord.js bot, not Electron, not a cloud VM.

[![Release](https://img.shields.io/github/v/release/ArdaDDemir/crew)](https://github.com/ArdaDDemir/crew/releases/latest)

**[Download Crew for Windows](https://github.com/ArdaDDemir/crew/releases/latest)** — `Crew_0.9.0_x64-setup.exe` (NSIS) or the MSI. Portable zip is on the same page.

![Crew office](docs/assets/office.png)

## What you get

| | |
|---|---|
| Channels + People + Direct | Discord-like rail. `@` is the scheduler. |
| 2.5D floor | Members desk: glass room, PCs, walk, doors, furniture, looks. |
| Crew.exe | Tauri + WebView2 window. Same office as `bun run ui`. |
| Split panes | Drag a chat to the right. Max two in-page panes. |
| Jobs | Settings → Title / Compact / Vision / Read (not extra People). |
| Providers | OpenRouter, plus optional Claude / Codex / Grok / OpenCode CLI spawn. |
| MCP | Stdio or HTTP servers. Tools, resources, prompts on OpenRouter turns. |
| Browser tools | Isolated Playwright profile under `.crew/browser/`. Not your mouse. |
| Discord | Optional adapter (`apps/discord`). Core has no Discord. |
| Invites | Owner mints a token. Guest may chat; cannot edit the office. |

Default permission is **auto-accept** (workspace file writes + workspace shell). `mcp_*` and `browser_*` ask. `.env` and `~/.ssh` are always denied.

![Split panes](docs/assets/split.png)

## Install (Windows)

1. From [Releases](https://github.com/ArdaDDemir/crew/releases/latest) download **Crew_0.9.0_x64-setup.exe**.
2. Install. WebView2 is Windows 11 / current Edge.
3. Open a project folder. Crew writes `.crew/` there.
4. Settings → Providers: paste an [OpenRouter](https://openrouter.ai) key (or another OpenAI-compatible `base_url`).

MSI: `Crew_0.9.0_x64_en-US.msi`. Portable: unzip next to `Crew.exe` + `crew-server.exe` + `public/`.

Wiki: [Install](https://github.com/ArdaDDemir/crew/wiki/Install) · [Office](https://github.com/ArdaDDemir/crew/wiki/Office) · [Discord](https://github.com/ArdaDDemir/crew/wiki/Discord)

## Run from source

[Bun](https://bun.sh) 1.4+. Crew.exe from source also needs [Rust](https://rustup.rs) 1.77+.

```powershell
git clone https://github.com/ArdaDDemir/crew.git
cd crew
bun install
bun test
$env:OPENROUTER_API_KEY="sk-or-..."
bun run crew -- config set key $env:OPENROUTER_API_KEY
bun run ui
```

Office: [http://127.0.0.1:7734](http://127.0.0.1:7734). Window: `bun run desktop`. Installers: `bun run desktop:build` → `dist/`. Hard-refresh (**Ctrl+F5**) after UI pulls.

CLI `crew` is tests and scripts on the same engine, not a TUI product.

```powershell
bun run crew -- bot create lead --name Lead
bun run crew -- bot create coder --name Coder
bun run crew -- channel create landing --bots lead,coder --lead lead
```

`crew serve` is the same loopback office (`127.0.0.1` only). Not `0.0.0.0`.

## Docs

Agents start at [`AGENTS.md`](./AGENTS.md). Humans: [wiki](https://github.com/ArdaDDemir/crew/wiki) first.

| | |
|---|---|
| Map | [`docs/README.md`](docs/README.md) |
| Decisions | [`docs/adr/`](docs/adr/) (0001–0060) |
| Now / gaps | [`docs/todos/now.md`](docs/todos/now.md) |
| Changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Contributing | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

Stack: TypeScript + Bun. Hexagonal core (`packages/core` has no fetch/UI). Logs: `.crew/logs/*.jsonl` (append-only). License: MIT.

## Not this

Public bind (`0.0.0.0`), live desktop mouse, Electron, signed auto-install, macOS/Linux bundles, T3 plugin marketplace. Isolated browser tools and the Discord adapter are in. Parked notes: `docs/todos/now.md`.
