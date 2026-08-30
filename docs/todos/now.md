# Now — what is in, what is missing

Date: 2026-08-30  
Law: `AGENTS.md` + `docs/adr/`. This file is a snapshot, not a second spec.

Current release: **0.9.0**. Unreleased (on `master`, not tagged): cubicle grid; channel = project room (header brief + empty CONTEXT `(not set)`); workspace-relative Files; README credits. Parks: public `0.0.0.0`, live desktop mouse, signed auto-install, macOS/Linux.

---

## Inspired by (detail)

Crew is a **local office**. We looked at two products and copied patterns, not their codebases as a fork.

### Grok Bot — [x.ai/bot](https://x.ai/bot) · [launch](https://x.ai/news/introducing-grok-bot)

xAI + Cursor. Closed product. We **looked at** the UX and wrote our own engine.

| Copied | Crew today | Left out |
|---|---|---|
| Named people | `.crew/bots/<id>/` + `SOUL.md` | Cloud computer / always-on VM |
| Group channels | `.crew/channels/<id>/` + `RULES.md` / `CONTEXT.md` | Their hosted app / iOS |
| `@` wake, others wait | mention router (`ADR-0013`, `ADR-0014`) | 50-routine catalog |
| Account after desk work | channel `message.posted` is the account, tools stay on the desk (`ADR-0012`) | Computer-use as the default hands |
| Need-human is a stop | no extra `@` to “wait together” | Come-back-when-laptop-is-off (that needs their cloud) |
| Bot↔bot + human DMs | JSONL DMs; human can read every DM | Slack/Gmail connectors |
| Skills | Agent Skills `SKILL.md` full body (`ADR-0021`) | Plugin marketplace |

Design sentence in `docs/superpowers/specs/2026-08-27-crew-runtime-design.md`: “A local Grok Bot.” Floor visor is not that sentence. Channel = project room is.

### T3 Code — [github.com/pingdotgg/t3code](https://github.com/pingdotgg/t3code) · [t3.codes](https://t3.codes)

Theo / pingdotgg. MIT. We **looked at** Settings, modes, picker — we did not vendor their repo.

| Copied | Crew today | Left out |
|---|---|---|
| Four permission modes | `supervised` \| `auto-accept` \| `auto` \| `full-access` (`ADR-0007`) | Electron control plane |
| Settings → Providers cards | OpenRouter + Claude / Codex / Grok / OpenCode (`ADR-0030`) | T3 plugin marketplace (`ADR-0036`) |
| One implementation picker | Person + Default (`ADR-0031`); Jobs = OpenRouter only (`ADR-0043`) | Cursor / Amp extra harnesses |
| Optional harness spawn | enabled Person turn spawns that CLI (`ADR-0034`, `ADR-0035`) | T3 as the product (wrapping CLIs is not our engine) |
| Auto-accept = workspace hands | file writes **and** workspace `shell`; `mcp_*` / `browser_*` ask (`ADR-0044`, `ADR-0050`) | Their mobile app / remote relay |

Window is Tauri 2 + WebView2 (`ADR-0032`), not Electron.

### Built with

Vibecoded with **Grok 4.6**. Public README says the same.

---

## In (0.9.0)

Human ids (`ADR-0047`). Loopback `crew serve` (`ADR-0048`). Discord adapter (`ADR-0049`–`0053`). Browser tools (`ADR-0050`). Invite chip / live shot / Discord queue / Playwright (`ADR-0054`). Guest cannot write the office (`ADR-0055`). 2.5D floor, walk, doors, furniture, looks (`ADR-0056`–`0060`). Human wins over soul/rules; identity history line; `dms show` unknown dm; patch excerpt; shell timeout line.

See `CHANGELOG.md` `[0.9.0]`.

## In (unreleased, on master)

Channel is a **project room**, not a chat toy.

| Piece | What |
|---|---|
| Header `.room-brief` | First `CONTEXT.md` line, or **No About — bots will ask, not invent.** Click opens the channel sheet. |
| Empty inject | Empty RULES / CONTEXT / folders still emit `## Channel … (not set)` and “ask, do not invent.” |
| Files | Workspace-relative hints. Absolute picks stripped. `..` / `.env` / `.ssh` dropped. Unique `/api/paths` match when the leaf is unique. |
| Cubicle grid | Desks left of glass, You in the aisle, working chatboxes. |
| Wiki Office | Rooms table: About / Rules / Files. |

See `CHANGELOG.md` `[Unreleased]`.

## In (0.8.0)

Held handoff (`ADR-0045`). Unknown `@` announced (`ADR-0046`). Inference-retry cannot claim unrun tools. History `[other bot, not you]`. DM pointer: last channel account may be stale.

See `CHANGELOG.md` `[0.8.0]`.

## In (0.7.0)

Honesty pack: fence `@`, `list_dir` skip, Jobs OpenRouter-only, forced empty account, harness tree-kill, MCP ask, conservative reviewer, shell lock, unread DM pointer, CLI `woke:` first, MCP `clientInfo.version` from `package.json`.

See `CHANGELOG.md` `[0.7.0]`.

## In (0.6.0)

`dist/latest.json` from `desktop:build`; relative download URLs (`ADR-0040`). `GET /api/health` has `version`. DM permission mode (`ADR-0041`). `auto` reviewerModel (`ADR-0042`). `crew mode <dmId>`.

See `CHANGELOG.md` `[0.6.0]`.

## In (0.5.0)

MCP **resources/prompts** as Crew tools (`ADR-0038`). `desktop:build` also tries a **MSI**. Opt-in About **Check for updates** + Crew.exe **tray** (`ADR-0039`).

See `CHANGELOG.md` `[0.5.0]`.

## In (0.4.0)

Office UI + Crew.exe, People accordion, drag-split, Providers picker, Jobs, harness spawn (Grok/Claude/Codex/OpenCode), MCP stdio **and HTTP**, `crew say`/`crew dm` same bind, T3-shaped harness permission map (`ADR-0037`), Windows NSIS attempt on `desktop:build`.

See `CHANGELOG.md` `[0.4.0]`.

---

## Next (do these; ranked)

Channel-as-room is in. Floor polish is not the next lever. Two product holes remain. Research notes for *how* go under each item after the research pass.

### 1. Evidence in the account — do next

**Hole.** Prompt already says “what you actually did, which files.” Files modal already shows `apply_patch` hunks (`GET /api/diff`, `/diff`). Models still write “I patched index.html” with no hunk and no test line. Humans cannot tell a lie from a receipt. Same class as Grok Build claiming a file change with `agentFilesTouched: 0` ([xai-org/grok-build-plugin-cc#33](https://github.com/xai-org/grok-build-plugin-cc/issues/33)).

**Wanted.** The spoken account (or an engine line next to it) must include:

- paths actually touched this turn (from tool events, not the model’s memory)
- a short unified hunk or “no file writes”
- if `shell` ran tests: the command + exit + last lines — or “tests not run”

**Not.** Accept/Reject git UI. Not T3 checkpoints / hidden git refs / worktrees / PR buttons. Not a second LLM “verify” job.

**How (research, 2026-08-30).** Industry agrees: **the spoken summary is not evidence. The tool trace is.**

| Product | What they do | Steal? |
|---|---|---|
| [T3 Code](https://flaviocopes.com/t3-code/) | “A final agent message is a summary. The **diff is evidence**.” Per-turn diffs from provider `fileChange` events. File chips on the assistant **timeline**. Checkpoints = hidden git refs. | Steal: chips on the account row from engine events. Leave: git checkpoints, branch/working-tree panel, revert. |
| Claude Code `/diff` | Per-turn view reconstructed from **FileEdit / FileWrite records in the conversation**, not `git diff`. Survives the human’s own edits. Native Edit tool already paints a unified hunk. Models still lie if you only read the prose ([#26066](https://github.com/anthropics/claude-code/issues/26066)). | Steal: derive from JSONL `tool.requested` / `tool.completed`, not git. Leave: Accept/Reject. |
| Grok Bot | `SendMessage` is the only voice (same as Crew’s account). Prompt: “Show your work. Attach the file that proves it.” “Never invent screenshot paths.” “Never fabricate data.” | Steal: proof is an attachment/receipt the engine can check. Leave: cloud box, screenshots as default, “reply first” chatter. |

Crew already records `tool.requested` (name + args) and `tool.completed` (output, 8k cap) per turn (`packages/core/src/turn.ts`). `GET /api/diff` already walks `apply_patch` args for the files modal. The hole is: that receipt lives in the **files chip**, not next to the **account**, and test `shell` is not in it.

**Ship as:**

1. Pure function `buildTurnReceipt(events, turnStartedId)` over this turn’s `tool.requested` / `tool.completed`. `apply_patch` with success → `{ path, snippet }` (reuse files-modal hunk). Failed patch → list as failed, not as a write. `shell` whose command matches `bun test` / `npm test` / `cargo test` / `go test` → `{ command, tail }` from `tool.completed.output`. Else `tests: "not run"`. No writes → `files: []`.
2. Append-only `turn.receipt` after `message.posted` (or with `bot.turn.completed`). Never rewrite the account line. ADR (next **0061**). Spec: `docs/specs/session-jsonl.md`.
3. Prompt (`packages/core/src/prompt.ts` WORLD step 3): “The engine posts a receipt of files you actually patched and tests you actually ran. Do not contradict it. If the receipt is empty, do not say you patched or that tests passed.”
4. UI: under the account bubble, a receipt row (paths + collapsed hunk + test tail). Click path opens existing `/diff` modal. English: **No file writes this turn.** / **Tests not run.**
5. Tests first (TDD): scripted provider that *says* “I patched index.html” with no `apply_patch` → receipt `files: []`. One that `apply_patch`s → path + snippet. One that `shell`s `bun test` → command + output tail. Domain only; no OpenRouter.

Status line like `handoff.held` is enough if we do not want to wait for the model to confess. Do not merge the receipt into `message.posted.text` (that would look like the bot spoke engine words).

### 2. Person = specialist

**Hole.** Soul / standing orders / skills exist on disk and on the Person sheet. Member list already shows the first `SOUL.md` line. Empty soul/skills are **omitted** from the prompt — same class of bug empty CONTEXT used to have (bot invents a job). Lead `@coder` is already the assign step.

**Wanted.**

- Empty SOUL / AGENTS / skills inject `(not set)` + “you have no specialty written; do not invent one; ask or stay a generalist.”
- Person rail / sheet shows that line the way `.room-brief` shows About.
- Do **not** change skills to catalog-only (`ADR-0021`).

**Not.** Auto-generated personas. Not a clothing/job marketplace. Not Grok Bot’s “one primary job” cloud form.

**How (research, 2026-08-30).** Copy the empty-CONTEXT pattern already shipped. Do not copy T3 `$` skill picker or Grok Bot plugin marketplace.

| Source | What they do | Steal? |
|---|---|---|
| Crew CONTEXT (unreleased) | Empty still emits `## Channel context` + `(not set)` + “do not invent.” | **Yes — same inject for Soul / Standing orders / Skills.** |
| Agent Skills spec | Body is the procedure. Catalog-only caused Crew to invent steps (`ADR-0021`). | Keep full body. Empty list = no skills section with `(not set)`, not a fake catalog. |
| Grok Bot create form | Name + one primary job + description. Cloud teammate. | Steal the **one-line job** as the first `SOUL.md` line (already in `botLine`). Leave their marketplace and “routines.” |
| T3 `$` skills | Discovers System/Personal/Project/App skills for the **wrapped** CLI. | Out. Crew skills are per-person files, not a global picker. |

**Ship as:**

1. RED test in `packages/core/src/prompt.test.ts`: empty soul/orders/skills still contain `## Soul`, `## Standing orders`, `## Skills` and “do not invent a specialty.”
2. `prompt.ts` else-branches next to the CONTEXT ones. Copy: “(not set). No SOUL.md. Do not invent a personality or a job title. Stay a generalist or ask the human.” Skills: “(not set). No SKILL.md. Do not invent a procedure. Ask, or use tools without a recipe.”
3. Bootstrap already maps bots; add `specialty` = first non-empty soul line ≤80 (same helper shape as `channelBrief`). Rail person title / Person sheet line. Empty: **No Soul — generalist until you write one.**
4. No ADR if it is the same inject as CONTEXT. User-visible: CHANGELOG. Spec: `docs/specs/bots-and-channels.md`.

This is smaller than evidence. Do evidence first if only one slice lands.

### 3. Split-brain DM vs channel (later than 1–2)

Edge catalog case 3: human DMs coder “use red”, channel tells designer “use blue”. Designer never hears the DM. Disk is still truth. Pointers exist (`ADR-0016`). A louder conflict line in the account is enough; do not dump private DMs into the room.

---

## Still later (parked — do not start unless asked)

| Item | Why |
|---|---|
| Signed auto-install | Needs a public CDN + signing private key. Host `dist/latest.json` and paste its URL in About |
| macOS / Linux bundles | We only build on this Windows machine |
| T3 plugin marketplace | Out. MCP is the integration |
| Public bind / live desktop mouse | Research: `docs/todos/discord-serve-computer-use-research.md`. Browser tools are in (`ADR-0050`). `0.0.0.0` and interactive-desktop mouse still parked |
| Extra harnesses (Cursor, Amp) | Out |
| Skill on-demand / catalog-only | Out. Full body stays in the prompt (`ADR-0021`) |

NSIS/MSI/portable under `dist/` are rebuilt by `bun run desktop:build`. This machine has `Crew_0.9.0_x64-setup.exe`, `Crew_0.9.0_x64_en-US.msi`, and `dist/crew-windows/`.
