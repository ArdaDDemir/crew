---
status: accepted
date: 2026-08-29
decision-makers: Arda
---

# Office leftovers: invite UI, live shots, Discord queue, Playwright

## Context and Problem Statement

`ADR-0047`–`0053` shipped humans, loopback serve, Discord, and isolated browser tools. Four office leftovers stayed: anyone on loopback could mint invites; live `say` NDJSON showed `tool-call` before the PNG existed; Discord outbound awaited 429 inside the Crew turn; Playwright was a dynamic import with no package dependency. `0.0.0.0` and live desktop mouse stay parked.

## Decision Outcome

Qualifies `ADR-0047`, `ADR-0048`, `ADR-0049`, `ADR-0050`, `ADR-0053`.

1. **Invite UI / owner-only mint.** Top-bar identity chip: empty is the owner; pasted token is `Authorization: Bearer` from `localStorage crew.inviteToken` on `api()` and `/api/say`. Settings → General Create invite shows the raw token once, lists people, Revoke. Hash never in the UI. `POST /api/humans` and `/api/humans/revoke` are tokensuz owner only: a valid guest Bearer is HTTP 403 `owner only`; invalid is 401.
2. **Live screenshot.** After `tool.completed`, the engine may call `onToolDone({ name, output })`. Adapters map that to NDJSON `tool` plus `shot` when the output is a `.crew/browser/shots/*.png` path. The office folds the PNG onto the requested tool row. Not a new LLM `ChatEvent` type.
3. **Discord outbound queue.** Webhook, channel, and user-DM sends enqueue per destination. HTTP 429 honors JSON `retry_after` seconds, then `Retry-After`, then `X-RateLimit-Reset-After`. Enqueue does not block JSONL or wake. Not a hardcoded 5/5s bucket.
4. **Playwright package.** `playwright` is a dependency of `packages/tools-native`. Unit tests stay `MemoryBrowser` and do not download Chromium (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`). Live: `bunx playwright install chromium`. Crew.exe does not compile Chromium into the sidecar; missing Chromium stays `browser unavailable`.

Not this ADR: public `0.0.0.0`, live desktop mouse, 0.9.0.

### Confirmation

`apps/web` humans + say stream, `packages/core` `onToolDone`, `apps/discord` queue, `@crew/tools-native` playwright, CHANGELOG `[Unreleased]`.
