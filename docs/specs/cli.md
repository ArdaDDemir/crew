# CLI (v1)

Binary working name: `crew`. Streaming REPL, not a fullscreen TUI.

## Non-interactive

```
crew bot create <id> [--name TEXT] [--soul FILE]
crew bot list

crew channel create <id> --bots lead,designer,coder [--lead lead]
crew channel list
crew channel show <id>

crew say <channel> <text> [--thinking] [--verbose]
crew dm <bot-a> <bot-b> <text>
crew dm human <bot> <text>
crew log <channel> [--thinking] [--verbose]

crew mode <channel> <supervised|auto-accept|auto|full-access>
```

`--bots` is the membership list. The human is always included.

`say` / `dm` / `open` call OpenRouter when `OPENROUTER_API_KEY` is set. `--yes` allows asked tools for that process.

Default live output is the channel account only (`→ bot → model` then `bot: …`). Desk work is hidden:

- `--thinking` / `/thinking on` — stream thoughts
- `--verbose` / `/verbose on` — stream tool names
- `crew log <channel> --thinking --verbose` — replay desk work later

## Interactive

```
crew open <channel>
```

Then lines are posts to that channel. Mentions work as in the spec. Slash commands:

- `/mode supervised|auto-accept|auto|full-access`
- `/dm <bot> <text>` — human↔bot DM
- `/thinking on|off` — show desk thoughts live
- `/verbose on|off` — show tool names live
- `/quit`

Streaming tokens print as they arrive. Permission prompts are inline yes/no.

## Config

Env: `OPENROUTER_API_KEY`, optional `CREW_BASE_URL` / `CREW_MODEL`. Files: `~/.crew/config.json`, `.crew/config.json`.

## Out of v1

Fullscreen TUI, desktop, real Discord, git PR buttons, MCP.
