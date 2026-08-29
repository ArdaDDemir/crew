# Bots and channels

Working CLI name: `crew`. Rename later; the domain names below do not change.

## Bot

A bot is a persistent named teammate.

| Field | Meaning |
|---|---|
| `id` | stable slug (`designer`, `coder`). Never renamed after create. Reserved: `human`, `you`, `everyone`, `engine`, `user` (`ADR-0022`, `ADR-0047`) |
| `name` | display name |
| `icon` | optional glyph |
| `model` / `fallbackModel` | optional; else workspace default. OpenRouter ids for Crew talk |
| `titleModel` | optional; names Direct chats. Empty = Jobs Title |
| `harness` / `harnessModel` | optional; `null` or `claude` \| `codex` \| `grok` \| `opencode` plus that CLI's model id (`ADR-0030`, `ADR-0031`, `ADR-0034`, `ADR-0035`). When the Providers card is enabled, that Person's turn spawns the CLI. Otherwise talk uses `model` |
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
  config.json                  # project model, allowed, fallback, defaultPermissionMode, autoCompact, reviewerModel
  permissions.json             # Always rules (ADR-0018)
  humans.json                  # owner + extra humans, invite SHA-256 (ADR-0047)
  discord.json                 # optional guild/channel/user map (ADR-0049)
  jobs.json                    # title / compact / vision / read slots (ADR-0029, ADR-0031)
  providers.json               # OpenRouter + harness cards (ADR-0030, ADR-0031)
  bots/<id>/bot.json           # includes harness / harnessModel / titleModel
  bots/<id>/SOUL.md
  bots/<id>/AGENTS.md
  bots/<id>/skills/<slug>/SKILL.md
  channels/<id>/RULES.md
  channels/<id>/CONTEXT.md
  channels/<id>/channel.json   # members, lead, mode, folders, icon
  logs/channel-<id>.jsonl
  logs/dm-<a>__<b>.jsonl       # botA__botB or human__bot (owner)
  logs/dm-human__<bot>__<t>.jsonl  # extra chats with the owner (ADR-0025)
  logs/dm-user__<humanId>__<bot>.jsonl  # extra human (ADR-0047)
```

User config: `~/.crew/config.json` (API key, default model). Project file wins for model/allowed. `.crew/` is gitignored.
