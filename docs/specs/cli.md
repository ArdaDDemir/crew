# CLI

`crew` is the **test/script adapter**, not a TUI product. The office is `bun run ui`. See `docs/todos/cli-is-script.md`.

Binary working name: `crew`. Streaming REPL for tests/scripts, not a fullscreen TUI.

## Non-interactive

```
crew bot create <id> [--name TEXT] [--model ID] [--soul FILE] [--icon TEXT]
crew bot update <id> [--name TEXT] [--model ID] [--fallback ID] [--soul FILE] [--orders FILE] [--icon TEXT]
crew bot show <id>
crew bot list
crew skill list [bot]
crew skill show <bot> <name>
crew skill add <bot> --name N --desc D [--body FILE]
crew skill rm <bot> <name>
crew skill copy <fromBot> <name> <toBot>
crew channel create <id> --bots a,b [--lead id]
crew channel list|show <id>
crew mode <channel> <supervised|auto-accept|auto|full-access>
crew say <channel> <text> [--thinking] [--verbose]
crew dm <from> <to> <text>
crew dms
crew dms show <a> <b>
crew dms show <threadId>   # also human__bot__t… (`ADR-0025`)
crew open <channel>     (/thinking /verbose /mode /stop /quit)
crew log <channel> [--thinking] [--verbose]
crew config set model|fallback|key|base-url|allowed <value>
crew config show
```

`--bots` is the membership list. The human is always included. `--soul FILE` writes `SOUL.md`. Human `crew skill add` may write onto any bot; agents still use `skill_acquire` (copy or self-write only).

`say` / `dm` / `open` call OpenRouter when `OPENROUTER_API_KEY` is set. `--yes` allows asked tools for that process. `always` at a prompt writes `.crew/permissions.json` (`ADR-0018`).

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
- `/stop` — halt an in-flight dispatch; with nothing running prints `nothing running`
- `/quit`

The account prints when that bot’s desk round finishes (not tool-round mutter). Permission prompts are inline yes/no.

## Config

Env: `OPENROUTER_API_KEY`, optional `CREW_BASE_URL` / `CREW_MODEL`. Files: `~/.crew/config.json`, `.crew/config.json`.

The same engine is `bun run ui` (`docs/specs/web-ui.md`).

## Out of 0.2

Fullscreen TUI, Electron, real Discord API, git PR buttons, MCP, `crew serve`.
