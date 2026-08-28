# Todo: multi-human remote (not Claude Remote)

Status: parked — research only, no ADR yet, not v1  
Owner: Arda  
Date: 2026-08-27

## What Arda asked for

Several people share one Crew app. A Linux box runs the bots and the workspace. When someone adds/joins a channel they paste a token. Think “office on a server,” not “steer my laptop from my phone.”

## Why Claude Remote is the wrong copy

Claude Code Remote Control, Copilot `--remote`, Codex Remote are the same pattern: **one human, one local session, phone/browser as a second keyboard**.

- Agent stays on *your* machine. Vendor cloud is only a relay (outbound HTTPS + QR).
- Pairing is 1:1 to the logged-in account. Not a team join.
- Claude Remote needs `claude.ai` login. API keys are rejected.
- Session mostly dies with the process. Headless Linux is an afterthought.
- Visibility is single-user.

That solves “I left the desk.” It does not solve “Arda and a friend both talk to the same bots on one Linux box.”

If we only needed phone steering of Arda’s PC, Claude Remote would be enough — and we still should not depend on Anthropic’s relay.

## Patterns that actually match

| Pattern | What it is | Fit |
|---|---|---|
| Claude / Copilot / Codex Remote | 1 operator, QR, vendor relay | No — wrong social model |
| Cloud agent (Claude on the web, Copilot Mission Control) | Agent runs in vendor cloud | No — we own the desk + files |
| OpenCode `serve` + `attach` | One HTTP backend, many UI clients | Architecture yes, identity still 1 human |
| Discord/Slack invite | Server owns rooms, token joins a person | **This is the product** |
| DIY remote box (systemd + Tailscale) | Always-on Linux, tools stay on the box | How we host it |

## Recommended shape (later)

```
Humans' browsers  --token-->  Linux: `crew serve`
                                   |
                                   +-- .crew workspace, bots, tools, git
                                   +-- many human identities, not one "you"
                                   +-- channels with invite tokens
```

1. **Daemon, not a tunnel to a laptop.** `crew serve` under systemd on Linux. UI is already a client (`ADR-0017`). Same `packages/core`.
2. **Invite token = join, not Claude QR.** Creating a channel (or workspace) mints a token. Paste token + server URL to join. Token scoped: workspace vs one channel. Rotate/revoke.
3. **Humans are first-class.** Today every person is `kind: "human"`. Remote team needs `humanId` (or handle) so two people in `#landing` are distinct, latest-human-wins is per person, DMs are `arda__coder` not `human__coder`.
4. **Network:** do not bind `0.0.0.0` naked. Tailscale or Caddy+HTTPS. Token is not enough if the port is public.
5. **Desk stays on the server.** Shell/patch run on the Linux box. Browsers only see chat, thinking folds, presence.

Optional later: Tailscale-only “remote control of *this* session” (Claude-like) as a mode. That is a different todo.

## Blockers before building

- Event author is a single `human` (`ADR-0016` latest human wins). Must become per-human.
- No auth in `apps/web`.
- Local `.crew` is one operator’s disk.
- Need an ADR when this is next.

## Not this todo

- Discord API
- Anthropic/OpenAI vendor remote
- Shipping `crew serve` in the current UI pass
