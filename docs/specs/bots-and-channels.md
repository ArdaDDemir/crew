# Bots and channels

Working CLI name: `crew`. Rename later; the domain names below do not change.

## Bot

A bot is a persistent named teammate.

| Field | Meaning |
|---|---|
| `id` | stable slug (`designer`, `coder`) |
| `name` | display name |
| `soul` | `SOUL.md` — voice |
| `standingOrders` | `AGENTS.md` — always on |
| `skills` | `skills/*/SKILL.md` |
| `tools` | allowlist; default `read`, `apply_patch`, `shell` |

Creating a bot does not put it in a channel. Membership is per channel.

## Channel

Created by the human. Not a Discord guild; one workspace (cwd) has many channels.

| Field | Meaning |
|---|---|
| `id` | slug (`landing`) |
| `title` | display |
| `leadBotId` | optional; receives un-@’d human messages |
| `memberBotIds` | bots the human put in this room |
| `rules` | `RULES.md` — law of the room |
| `context` | `CONTEXT.md` — what this room is, paths, current goal |
| `permissionMode` | see `permissions.md` |

The human is always a member.

Channel rules and context are injected into **every** bot turn in that channel, in addition to that bot’s soul.

## DM

A DM is a 1:1 thread: `human↔bot` or `bot↔bot`.

- Not a channel. No extra members.
- Has its own JSONL log.
- The human may list and read all DMs.
- Permission mode defaults to the workspace default (`auto-accept`) unless set on that DM.

A bot opens a DM by emitting a `dm.send` tool (or an engine-level action) targeting another member bot. The engine creates the thread if missing and posts the message. The target bot then takes a turn in that DM (this **is** a wake; no extra `@` required inside an already-addressed DM).

## Data on disk (v1)

```
.crew/
  bots/<id>/SOUL.md
  bots/<id>/AGENTS.md
  bots/<id>/skills/...
  channels/<id>/RULES.md
  channels/<id>/CONTEXT.md
  channels/<id>/channel.json   # members, lead, mode
  logs/channel-<id>.jsonl
  logs/dm-<a>-<b>.jsonl        # ids sorted
```
