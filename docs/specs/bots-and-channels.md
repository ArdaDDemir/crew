# Bots and channels

Working CLI name: `crew`. Rename later; the domain names below do not change.

## Bot

A bot is a persistent named teammate.

| Field | Meaning |
|---|---|
| `id` | stable slug (`designer`, `coder`). Never renamed after create. Reserved: `human`, `you`, `everyone`, `engine` (`ADR-0022`) |
| `name` | display name |
| `icon` | optional glyph |
| `model` / `fallbackModel` | optional; else workspace default |
| `soul` | `SOUL.md` — voice |
| `standingOrders` | `AGENTS.md` — always on |
| `skills` | `skills/<slug>/SKILL.md` (`ADR-0021`) |
| `tools` | allowlist; default `read`, `apply_patch`, `list_dir`, `shell` plus org tools |

Creating a bot does not put it in a channel unless the UI/CLI adds membership. Org tool `bot_create` adds them to the current channel.

## Channel

Created by the human. Not a Discord guild; one workspace (cwd) has many channels.

| Field | Meaning |
|---|---|
| `id` | slug (`landing`). Never renamed after create (`ADR-0024`) |
| `title` | display |
| `leadBotId` | optional; receives un-@’d human messages |
| `memberBotIds` | bots the human put in this room |
| `rules` | `RULES.md` — law of the room |
| `context` | `CONTEXT.md` — what this room is, paths, current goal |
| `permissionMode` | see `permissions.md` |
| `icon` | optional glyph |
| `folders` | path hints this room cares about |

The human is always a member. UI may assign a random locked slug on create.

Channel rules and context are injected into **every** bot turn in that channel, in addition to that bot’s soul.

## DM

A DM is a 1:1 thread: `human↔bot` or `bot↔bot`.

- Not a channel. No extra members.
- Has its own JSONL log.
- The human may list and read all DMs.
- Permission mode defaults to the workspace default (`auto-accept`) unless set on that DM.

A bot opens a DM by emitting `dm_send` (`to`, `text`) targeting another **channel member**. The engine creates the thread if missing, posts the message, then the target takes **one** DM turn (no nested `dm_send`). Human: `crew dms` / `crew dms show a b`.

## Data on disk (v1)

```
.crew/
  config.json                  # project model, allowed, fallback
  permissions.json             # Always rules (ADR-0018)
  bots/<id>/bot.json
  bots/<id>/SOUL.md
  bots/<id>/AGENTS.md
  bots/<id>/skills/<slug>/SKILL.md
  channels/<id>/RULES.md
  channels/<id>/CONTEXT.md
  channels/<id>/channel.json   # members, lead, mode, folders, icon
  logs/channel-<id>.jsonl
  logs/dm-<a>__<b>.jsonl       # botA__botB or human__bot
  logs/dm-human__<bot>__<t>.jsonl  # extra chats with one person (ADR-0025)
```

User config: `~/.crew/config.json` (API key, default model). Project file wins for model/allowed. `.crew/` is gitignored.
