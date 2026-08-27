# Architecture Decision Records

Format: MADR-lite in `docs/adr/`. Numbers are monotonic. Never reuse a number. Accepted files are immutable except `status` and a “superseded by” link.

| ID | Title | Status |
|---|---|---|
| 0001 | Record architecture decisions | accepted |
| 0002 | Hexagonal core; CLI is an adapter | accepted |
| 0003 | OpenAI-compatible provider (OpenRouter default) | accepted |
| 0004 | Append-only JSONL event log | accepted |
| 0005 | Bots, channels, mentions, DMs | accepted; qualified by 0013/0014 |
| 0006 | SemVer 0.x until 1.0 | accepted |
| 0007 | Four permission modes (T3-shaped) | accepted; shell row → 0011 |
| 0008 | Skills + channel rules/context as markdown | accepted |
| 0009 | TypeScript + Bun | accepted |
| 0010 | AGENTS.md is the agent-facing law | accepted |
| 0011 | Auto-accept shell + thinking log | accepted |
| 0012 | Desk then account (engine-enforced) | accepted |
| 0013 | One turn per bot per say (human stop) | accepted; qualified by 0014 |
| 0014 | Human-tagged `say` does not hand off | accepted |
| 0015 | `dm_send` + human can read every DM | accepted |
| 0016 | Latest human message wins across channel/DM | accepted |
