# Architecture Decision Records

Format: MADR-lite in `docs/adr/`. Numbers are monotonic. Never reuse a number. Accepted files are immutable except `status` and a “superseded by” / “qualified by” link.

## How to read

| If you are changing… | Read |
|---|---|
| Mention wake / who runs | 0005 → 0013 → 0014 → **0043** (fence skip) → **0045** (held handoff) → **0046** (unknown `@`) |
| Desk vs channel chat | 0012, 0011 |
| DMs / conflicting human orders | 0015, 0016, 0025 → **0033** → **0044** (unread pointer) → **0047** (`humanId`) |
| Skills / SKILL.md | 0008 → 0021 → 0023 |
| JSONL / compact / delete | 0004 → 0018, 0019 → **0028**; titled/jobs → **0029** → 0031 |
| Permissions / Always | 0007 → 0011, 0018 (Settings Add → 0030) → **0041** (DM mode) → **0042** (`auto` reviewer) → **0043** (honesty A) → **0044** (mcp / reviewer / shell lock) → **0050** (`browser`) |
| Local UI | 0017 → 0020 → 0023 → 0024 → 0026 → 0027 → 0028 → 0029 → 0030 → 0031 → **0032** → **0033** → **0036** → **0038** → **0039** → **0040** → **0041** → **0048** (`crew serve`) → **0054** (invite chip, live shot) → **0055** (guest writes) → **0056** (isometric floor) → **0057** (walk) → **0058** (doors) → **0059** (furniture) → **0060** (looks) |
| Discord adapter | **0049** → **0051** (DMs) → **0052** (ask buttons) → **0053** (`dm_send`) → **0054** (outbound queue) |
| Desktop window | **0032** → **0039** (tray + opt-in updates) → **0040** (`latest.json`) |
| Providers / Person picker / Jobs impl | **0030** → **0031** → **0034** / **0035** (harness spawn) → **0036** (MCP) → **0037** → **0038** (resources/prompts) → **0061** (spawn contract fixes, effort, stream keepalive) |
| Org tools / reserved ids | 0022 → **0047** (`user`) |
| Version / law file | 0006, 0010 |

## Index

| ID | Title | Status |
|---|---|---|
| 0001 | Record architecture decisions | accepted |
| 0002 | Hexagonal core; CLI is an adapter | accepted; HTTP UI → 0017 |
| 0003 | OpenAI-compatible provider (OpenRouter default) | accepted |
| 0004 | Append-only JSONL event log | accepted; compact event → 0019; summary → 0028 |
| 0005 | Bots, channels, mentions, DMs | accepted; qualified by 0013/0014 |
| 0006 | SemVer 0.x until 1.0 | accepted |
| 0007 | Four permission modes (T3-shaped) | accepted; shell row → 0011 |
| 0008 | Skills + channel rules/context as markdown | accepted; loader → 0021 |
| 0009 | TypeScript + Bun | accepted |
| 0010 | AGENTS.md is the agent-facing law | accepted |
| 0011 | Auto-accept shell + thinking log | accepted |
| 0012 | Desk then account (engine-enforced) | accepted |
| 0013 | One turn per bot per say (human stop) | accepted; qualified by 0014 |
| 0014 | Human-tagged `say` does not hand off | accepted |
| 0015 | `dm_send` + human can read every DM | accepted |
| 0016 | Latest human message wins across channel/DM | accepted |
| 0017 | Local web UI adapter | accepted; live office → 0020 |
| 0018 | Office delete + persistent Always | accepted |
| 0019 | Prompt history window + thread.compacted | accepted; qualified by 0028 |
| 0020 | Live office UI (watch, members, settings) | accepted; sheet chrome → 0023 |
| 0021 | SKILL.md slug + full file in the prompt | accepted; skill sheet → 0023 |
| 0022 | Org tools + reserved bot ids | accepted |
| 0023 | Office sheets: hover help, skill editor, closed dialogs | accepted; attach/chrome → 0024 |
| 0024 | Office attach, locked ids, semantic buttons | accepted |
| 0025 | Several private chats with the same person | accepted |
| 0026 | Office jump palette and context actions | accepted; qualified by 0027 |
| 0027 | In-page snap panes | accepted |
| 0028 | Compact layers (window + trim + LLM summary) | accepted |
| 0029 | Jobs are hidden workspace slots, not People | accepted; qualified by 0031 |
| 0030 | Providers tab + Person harness field (spawn later) | accepted; qualified by 0031, **0034** |
| 0031 | Implementation picker; Jobs slots share it; custom models | accepted |
| 0032 | Desktop shell is Tauri + WebView2 around the office | accepted; qualified by **0039** |
| 0033 | Human DMs nest under People, not a flat Direct dump | accepted |
| 0034 | Grok Person turns spawn the Grok CLI | accepted; qualified by **0035** |
| 0035 | Claude, Codex, OpenCode Person turns spawn those CLIs | accepted |
| 0036 | MCP stdio servers add tools on Crew-native turns | accepted; qualified by **0037**, **0038** |
| 0037 | CLI parity, harness permission map, MCP URL/env, Windows NSIS | accepted |
| 0038 | MCP resources and prompts become Crew tools | accepted |
| 0039 | Opt-in update check and Crew.exe tray | accepted; qualified by **0040** |
| 0040 | `desktop:build` writes `dist/latest.json`; relative download URLs | accepted |
| 0041 | DM threads honor permission mode | accepted |
| 0042 | `auto` uses Settings reviewerModel | accepted |
| 0043 | Honesty and safety hardening (Wave A) | accepted |
| 0044 | Honesty pack Wave B/C (mcp, reviewer, shell lock, unread DM) | accepted |
| 0045 | Held handoff is an engine pointer, not a wake | accepted |
| 0046 | Unknown `@` is announced, still not a wake | accepted |
| 0047 | Humans have ids; owner is `human` | accepted |
| 0048 | `crew serve` is the loopback office daemon | accepted |
| 0049 | Discord is an adapter | accepted |
| 0050 | Isolated browser tools; not the live desktop | accepted |
| 0051 | Discord DMs are Crew DMs | accepted |
| 0052 | Discord ask is Allow / Deny / Always buttons | accepted |
| 0053 | Crew `dm_send` to a mapped human also DMs Discord | accepted |
| 0054 | Office leftovers: invite UI, live shots, Discord queue, Playwright | accepted |
| 0055 | Guest invite cannot write the office | accepted |
| 0056 | Channel desk is a 2.5D isometric floor | accepted |
| 0057 | Click-to-walk on the isometric floor | accepted |
| 0058 | Floor doors switch channel | accepted |
| 0059 | Channel floor furniture is owner-editable | accepted |
| 0060 | Floor looks: skin, hair, top | accepted |
| 0061 | Harness spawn contract fixes and turn-stream keepalive | accepted; amends 0034/0035 |
