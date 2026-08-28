# Mentions and routing

This is the scheduler. Discord-like: you speak in a room; `@name` decides who acts.

## Parse

In a message body, a mention is `@` + a member slug:

- `@designer`
- `@coder`
- `@everyone` — every **bot** member of that channel (not a license to skip permissions)

Unknown `@foo` is ignored for routing (it may still appear as text). It does not error the post. The engine records `mention.ignored` so the human sees it was not a wake (`ADR-0046`). A bot who exists but is not in this channel is the same.

Mentions are case-insensitive. Slugs are `[a-z][a-z0-9-]*`.

`@` inside a fenced code block (`` ``` `` or `~~~`) or inline `` `code` `` is **not** a wake (`ADR-0043`). An unclosed fence masks through end of text. A URL path `/@user` is not a wake.

## Channel post from the human

1. Append `message.posted` to the channel log.
2. Compute `woken = mentioned bot members ∩ channel members`.
3. If `woken` is empty:
   - if the channel has a lead → `woken = [lead]`
   - else → no bot turn
4. Start one turn per woken bot. Turns for the same post run **in parallel**.
5. Bots not in `woken` **wait**. They do not see a “your turn” event.

## Channel post from a bot

Same parse. A bot's `@` is recorded on `message.posted`.

A bot is not auto-woken by its own message.

**One turn per bot per `say` (`ADR-0013`):** a bot that already completed a turn in this dispatch is not woken again, even if `@`'d.

**Human-tagged stop (`ADR-0014`):** if the human named member bots (or `@everyone`), only those bots run. Their `@` is chat, not a wake. If the human named nobody, the **lead** may `@` workers **once**; that is the last wave. Needing the human is a stop (ask in the channel, no `@`). The next job is the next `say`.

**Held pointer (`ADR-0045`):** after those waves, member `@id` in an account who did not run this `say` is recorded as `handoff.held` (English status line). Still not a wake.

## Parallel vs wait

Lead example:

> `@designer` hero’yu yaz. Aynı anda `@coder` API iskeletini kur. Diğerleri beklesin. Bitince `@tester` kır.

- That post wakes `designer` and `coder` now.
- `tester` is mentioned as a *future* instruction in prose, but **also** tagged. If `@tester` is present in the same message, tester wakes now too.

If the lead wants tester later, the lead **must not** `@tester` on this message. Tester waits for a **later human `say`** that `@tester`. A worker `@tester` in the same `say` does not wake tester (`ADR-0014`).

“Diğerleri beklesin” is the default engine behavior (no tag → no turn). It is not a special keyword.

## DM

A DM message wakes exactly the other party. Mentions inside a DM do not fan out to a channel.

A bot in a channel turn may also send a DM as a tool. That is a separate thread and a separate wake.

## Turn isolation

Each in-flight turn is `(channelId|dmId, botId, turnId)`.

One bot may not have two in-flight turns in the **same** thread. A second wake while busy is **queued** for that bot in that thread.

Two different bots in the same channel may be in-flight at once.

A bot **may** have a channel turn and a DM turn at once (different threads).

## What a woken bot sees

System layers, in order:

1. Bot `SOUL.md` + `AGENTS.md`
2. Channel `RULES.md` + `CONTEXT.md` (channel turns only)
3. Skill catalog (names + descriptions)
4. Recent thread messages (shared channel or that DM)
5. The waking message, with an explicit line: `You were mentioned and should act. Unmentioned bots are idle.`

The bot’s tools run under the thread’s permission mode.
