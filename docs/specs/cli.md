# CLI (v1)

Binary working name: `crew`. Streaming REPL, not a fullscreen TUI.

## Non-interactive

```
crew bot create <id> [--name TEXT] [--soul FILE]
crew bot list

crew channel create <id> --bots lead,designer,coder [--lead lead]
crew channel list
crew channel show <id>

crew say <channel> <text>
crew dm <bot-a> <bot-b> <text>
crew dm human <bot> <text>

crew mode <channel> <supervised|auto-accept|auto|full-access>
```

`--bots` is the membership list. The human is always included.

`say` / `dm` / `open` call OpenRouter when `OPENROUTER_API_KEY` is set. `--yes` allows asked tools for that process.

## Interactive

```
crew open <channel>
```

Then lines are posts to that channel. Mentions work as in the spec. Slash commands:

- `/mode supervised|auto-accept|auto|full-access`
- `/dm <bot> <text>` — human↔bot DM
- `/quit`

Streaming tokens print as they arrive. Permission prompts are inline yes/no.

## Config

Env: `OPENROUTER_API_KEY`, optional `CREW_BASE_URL` (OpenAI-compatible).

Config file later (`crew.toml`). v1 env is enough.

## Out of v1

Fullscreen TUI, desktop, real Discord, git PR buttons, MCP.
