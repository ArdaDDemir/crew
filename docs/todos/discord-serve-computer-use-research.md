# Research: Discord + `crew serve` + computer-use

Status: research only. No ADR yet. Do not ship until Arda picks a first slice.  
Date: 2026-08-28  
Law: `AGENTS.md` + `docs/adr/`. `packages/core` stays I/O-free.

Parked sources: `docs/todos/multi-human-remote.md`, `docs/todos/computer-use-and-browser.md`.

This is **not** Claude Remote (phone steering one laptop). This is: several humans, one workspace, optional Discord skin, optional screen/browser hands.

---

## Product sentence (must stay true)

**Human owns channels; `@` wakes bots; they work at the desk then account; need-human is a stop; bots may DM; CLI and local web are adapters; core has no UI.**

Discord is a **skin** on that sentence. `crew serve` is **who the humans are** and **where the desk lives**. Computer-use is **new desk tools**. If a design makes the sentence false, stop and write an ADR.

Recommended build order (dependency, not hype):

1. **`crew serve`** — auth + `humanId`. Unblocks Discord (Discord users are extra humans) and any second browser.
2. **Discord adapter** — Gateway in, webhook out. Same `dispatchChannelPost`.
3. **Computer-use** — new tools + permission row. Independent of Discord; can ship after or beside 1.

Do **not** start all three in one PR. Each needs its own ADR (next free: **0047**).

### Which to start (2026-08-28)

**Start with serve, but the first PR is `humanId`, not `0.0.0.0`.**

| If we start with… | What we get | What breaks / stays blocked |
|---|---|---|
| **Discord first** | Arda `@coder` in a guild tonight | Every Discord user collapses to `{ kind: "human" }`. Two people = one brain (`ADR-0016`). Bot-bot Discord is a second identity mess. Rework when serve lands. |
| **Computer-use first** | Bots click a Playwright window | Fun, local, no identity work. Does not make “office with a friend” true. Safety/permission ADR anyway. Can wait. |
| **Serve / `humanId` first** | Two browsers, two names, correct latest-human-wins, DMs `arda__coder` | Unlock Discord *and* LAN. Network bind is a later flag. Loopback + second “person” in tests is enough for v1 of 0047. |

Trap: OpenCode `serve` is one operator + HTTP. Copying only `--hostname 0.0.0.0` without `humanId` is a security hole and a product lie.

First concrete slice if Arda says go: **ADR-0047** — `author.humanId`, legacy `human` = owner, invite token hash, loopback still default, tests with two humans. No Discord.js, no Playwright, no public bind.

---

## 1. `crew serve` (multi-human remote)

### What Arda asked for (already in parked todo)

Several people share one Crew. A Linux box runs bots + workspace. Join by pasting a token. Office on a server, not “steer my Windows PC from my phone.”

### Who already built a cousin

| Who | What they built | Fit for Crew |
|---|---|---|
| **OpenCode** (`opencode serve` / `attach` / `web`) | One HTTP backend (Hono + Bun), many clients. Default bind `127.0.0.1:4096`. Password via `OPENCODE_SERVER_PASSWORD`. SSE `/event`. OpenAPI at `/doc`. LAN: `--hostname 0.0.0.0`. | **Architecture yes.** Identity is still one operator. Copy bind + password + SSE, not their session model. |
| **PraisonAI** `serve gateway` vs `bot` | Gateway = custom WS + multi-agent; Bot = Slack/Discord/Telegram. | Split is right: serve ≠ Discord. |
| **Claude / Copilot / Codex Remote** | 1 human, QR, vendor relay, agent on *your* laptop. | **Wrong social model.** Parked todo already rejected this. |
| **Discord / Slack invite** | Server owns rooms; token joins a person. | **This is the product** for join UX. |

OpenCode docs (2026): `opencode serve [--port] [--hostname] [--cors]`; basic auth; TUI is just another HTTP client. Crew’s UI is already that client (`ADR-0017`). We do not need a second TUI.

### Crew blockers (today)

- Event author is a single `{ kind: "human" }` (`ADR-0016` latest-human-wins is global, not per person).
- `apps/web` has no auth. Loopback only (`parseServerArgv` rejects non-loopback).
- `.crew/` is one operator’s disk.
- DMs are `human__coder`. Two people cannot both DM coder as distinct humans.

### How Crew should do it

```
Browsers  --HTTPS + token-->  Linux box: crew serve
                                  |
                                  +-- same packages/core
                                  +-- .crew workspace, tools, git
                                  +-- humans: { id, handle, token hash }
                                  +-- channels keep invite tokens
```

1. **Daemon, not a tunnel.** systemd (Linux) or NSSM/Task Scheduler (Windows later). Desk (shell/patch) runs on the box. Browsers only see chat, thinking, cards.
2. **Bind:** default still `127.0.0.1`. Remote: Tailscale or Caddy+HTTPS. Never naked `0.0.0.0` on the public internet. Token is not enough if the port is open.
3. **Join:** mint invite token (workspace or one channel). Paste URL + token. Rotate/revoke. Hash at rest (not the raw token in JSONL).
4. **`humanId`:** author becomes `{ kind: "human", humanId: "arda" }`. Latest-human-wins is **per bot, per human** (Arda’s DM to coder does not override Mehmet’s channel order for designer). DMs: `arda__coder`, not `human__coder`. Legacy `human__*` = the original operator.
5. **Permissions:** supervised cards go to the human who is in that channel, or the workspace owner. `ask` must name `humanId`.
6. **Reuse** existing `/api/say` NDJSON + `/api/watch`. Add `Authorization: Bearer` or cookie after token exchange.

### A–Z slice for serve (when building)

| Step | Work | ADR? |
|---|---|---|
| A | `humanId` on `message.posted`; migrate `human__` DMs | yes (0047) |
| B | `.crew/humans.json` + invite tokens | same or 0048 |
| C | Auth on `apps/web` (loopback stays open; remote requires token) | yes |
| D | `crew serve --hostname --port --cors` (CLI flag only; UI still the product) | no new TUI |
| E | Latest-human-wins per `(botId, humanId)` | qualifies 0016 |
| F | Tests: two humans, two DMs, invite revoke | TDD |

Not serve: Discord snowflakes, screenshot tools, Electron.

---

## 2. Discord API adapter

### Reality check

Crew already has a **Discord-like data model** (channels, members, `@`, DMs). Real Discord is a later **adapter**, not a rewrite. `docs/versioning.md`: 1.0 wants a second adapter (desktop **or** Discord) on the same core. Desktop already exists (`ADR-0032`). Discord would be the *network* second adapter.

### Who already built mention-wake Discord agents

| Who | What | Steal / skip |
|---|---|---|
| **discord.js v14** (Node/TS, Gateway API v10) | Default bot stack 2026. Intents required. `MessageContent` is privileged (approval if 100+ guilds; fine for a private office guild). | **Use this.** Crew is Bun/TS. |
| **npm `multi-project-gateway`** | Discord channel → project cwd → `@agent` → `claude --print`. Auto-handoff if the reply contains `@mention`. Session key `threadId:agentName`. | Routing is Crew-shaped. **Do not** spawn Claude CLI; call `dispatchChannelPost`. Their auto-handoff **violates `ADR-0014`** (human-tagged stop). Map `@` through Crew’s scheduler, not Discord-side handoff. |
| **davefmurray/grok-bot-discord** | Thin Gateway bridge: stay online, `@` wake, allowlists. **Does not** `if (author.bot) return` — that bug blocks bot↔bot. Always ping the peer bot on reply. | Steal allowlists + “accept bot authors.” One Discord bot ≠ many Crew people. |
| **Atlas Whoff / Pantheon** (DEV, 2026) | Used Discord as agent-to-agent bus after a custom WS gateway died. History + DMs + webhooks, zero infra. | Discord is durable transport. Crew already has JSONL; Discord is a **mirror**, not the store of record. |
| **PraisonAI bot discord** | Platform bot vs custom gateway. | Confirm: Discord is `apps/discord`, not core. |

### The identity problem (the hard part)

One Discord **application token** = one Discord **bot user**. Crew has up to 16 people. Options:

| Option | How | Verdict |
|---|---|---|
| A. One bot, prefix `**coder:**` | Ugly. Not a member list. | No |
| B. One bot, webhook `username` per Crew person | Discord allows override username/avatar on webhook execute. Limit ~15 webhooks/channel; Crew max 16 bots — tight if we use one webhook per bot. **One webhook, per-message username** is enough. | **Yes (v1 Discord)** |
| C. One Discord app per Crew bot | 16 tokens, 16 Gateway connections. Ops hell. | Later if we need real Discord members |
| D. Forum post per turn | Wrong UX | No |

**In:** one Gateway bot (office receptionist). Map guild+channel → Crew channel. Map Discord user id → `humanId`. Parse `<@discordId>` and `@coder` text.

**Out:** webhook execute with `username: Coder`, `avatar_url` from Crew icon. JSONL remains source of truth; Discord is a view.

### Discord A–Z (when building)

1. Private guild. Enable Message Content intent in Developer Portal (no 100-guild approval needed).
2. `apps/discord`: `discord.js` Client, intents `Guilds + GuildMessages + MessageContent + DirectMessages`.
3. Fail-closed allowlist: guild id, channel ids, human Discord ids. **Allow bot authors** on a list (other office bots).
4. `MESSAGE_CREATE` → if mapped channel → `postToChannel` / `dispatchChannelPost` with `humanId`. Mention parse: keep Crew `parseMentions` on the text; also map Discord `<@id>` via a table.
5. Bot account → webhook message in the same Discord channel. Do not Gateway-reply as the receptionist bot except for system lines (`handoff.held`, `mention.ignored`).
6. DMs: Discord DM to the receptionist bot → Crew DM `humanId__botId`. Crew `dm_send` to human → Discord DM to that user (REST). Bot-bot DMs stay in Crew JSONL (Discord cannot do 16-way private bot DMs cheaply).
7. Permissions: supervised Allow/Deny as Discord buttons (components) or a link back to the office UI. Buttons are nicer; UI is the fallback.
8. Rate limits: 5 msg/5s per channel typical; queue. One turn per bot per say already caps storms (`ADR-0013`).
9. `packages/core` still has **zero** Discord imports.

**Do not** implement Discord-side `@handoff` that wakes a second bot when the human already `@` named people (`ADR-0014`, `ADR-0045`).

### Mapping table (store in `.crew/discord.json`)

```json
{
  "guildId": "...",
  "tokenEnv": "DISCORD_BOT_TOKEN",
  "channels": { "123...": "landing" },
  "humans": { "456...": "arda" },
  "webhookId": "..."
}
```

---

## 3. Computer-use + in-app browser

### Two different products (do not mix)

| | Computer-use (desktop) | In-app / agent browser |
|---|---|---|
| Sees | Whole OS GUI (pixels) | One browser (pixels **or** DOM/a11y) |
| Acts | Mouse, keys, screenshot | Click, type, navigate, maybe `exec_js` |
| Danger | Clicks banking apps, password managers | Still cookies / XSS / prompt injection |
| Who | Anthropic computer toolset; OpenAI CUA `environment: windows` | Playwright, Playwright MCP, browser-use, OpenAI CUA `environment: browser` |

Parked todo mixed them. **Split:** browser-first is safer on this Windows box; full desktop control is a later opt-in.

### Who already built it

| Who | Mechanism | Notes |
|---|---|---|
| **Anthropic** computer use (GA 2026-08, `computer_toolset_20260801`) | Client toolset: 17 tools (`screenshot`, `left_click`, `type`, `zoom`, …). **You** execute on a machine you control. Official demo: Docker + Xvfb + noVNC (`anthropics/claude-quickstarts`). Multi-action per turn. Browser-use **member** uses page structure, not only pixels. | Loop is: model asks → harness acts → screenshot back. Not a cloud VM unless you host one. |
| **OpenAI** CUA / Agents SDK | `computerTool` + Playwright `LocalPlaywrightComputer`. Sample: `openai/openai-cua-sample-app`. Modes: **native** (click/type/screenshot) vs **code** (`exec_js` REPL). `computer-use-preview` model deprecated mid-2026; capability lives in Agents SDK. | Browser path is the one that works. |
| **Playwright MCP** (Microsoft) | DOM/a11y tools, no vision required. Apache-2.0. | Best fit for Crew **v1 browser**: already have MCP. A Playwright MCP server is an **enabled MCP**, not a new YAML format. |
| **browser-use** (Python) | Screenshot + vision. | Skip Python rewrite (`ADR-0009`). |
| **Skyvern** | Vision + workflows. | Overkill. |
| **ChatGPT / Codex in-app browser** | Vendor cloud browser. | Not our desk. |

CallSphere (2026): production harness = display + action executor + screenshot pipeline + stop condition.

### How Crew should do it (Windows office)

**v1 (browser, recommended):**

- Enable a Playwright MCP **or** native tools `browser_open`, `browser_snapshot` (a11y tree), `browser_click`, `browser_type`, `browser_screenshot`.
- Isolated Chromium profile under `.crew/browser/` (no default Chrome profile, no password store).
- Permission: new kind `browser` (like `mcp` after `ADR-0044`) — auto-accept **asks**. Always deny navigation to `file://`, `.env` URLs, `chrome://`.
- Show screenshots in the office as desk folds (not channel account). Account: “I opened the pricing page and copied the three plan names.”
- One browser per workspace, not per bot (cookie chaos). Optional later: per-bot profiles.

**v2 (desktop GUI, later):**

- Do **not** drive Arda’s real mouse. Use a **nested** session: Win11 sandbox, or a second virtual display. Anthropic’s own docs say sandboxed Xvfb — on Windows that is a VM or sandbox, not `SendInput` on the interactive desktop.
- Tools: `screen_screenshot`, `screen_click`, `screen_type` behind `full-access` **and** a visible “Crew is moving the pointer” banner + kill switch (existing Stop).
- Prompt injection: untrusted pixels can instruct the model. Same as Anthropic’s warning. Human-tagged stop still applies.

**Not v1:** controlling the live desktop, storing passkeys, Electron solely for this (`ADR-0032` already has WebView2).

### Computer-use A–Z (browser-first)

| Step | Work |
|---|---|
| A | ADR: `ToolKind` `browser`; always-ask on auto-accept |
| B | Playwright Chromium, profile `.crew/browser` |
| C | Tools or MCP: snapshot (a11y) + screenshot + click/type/navigate |
| D | Permission cards show URL + screenshot thumb |
| E | Tests: fake page, no live Google; deny `file://` |
| F | UI: desk fold for frames; channel stays English account |

---

## Shared rules (all three)

- Hexagonal: adapters outside `packages/core`. Core still `complete()` + tools + JSONL.
- TDD, fake provider, no OpenRouter in unit tests.
- English UI copy. Permissions never silent-upgrade to `full-access`.
- JSONL remains append-only source of truth. Discord/browser are views/actuators.
- Max 16 bots / 16 channels still.

## Explicitly out

- Rewriting core in Python for browser-use.
- Vendor remote relays (Claude.ai QR).
- Binding `0.0.0.0` without Tailscale/HTTPS.
- Discord-side auto-handoff that bypasses `ADR-0014`.
- Real mouse on the operator’s session as the first computer-use.

---

## Suggested first PRs (when Arda says go)

1. **ADR-0047 — humans have ids; invite tokens; serve bind.** Then code: `humanId`, auth, `crew serve` loopback+token.
2. **ADR-0048 — Discord is an adapter.** Then `apps/discord` Gateway + webhook username.
3. **ADR-0049 — browser tools.** Then Playwright profile + `browser` kind.

If only one starts: **0047**. Discord and a second laptop both need `humanId`.
