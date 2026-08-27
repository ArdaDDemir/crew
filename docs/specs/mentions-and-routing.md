# Mentions and routing

This is the scheduler. Discord-like: you speak in a room; `@name` decides who acts.

## Parse

In a message body, a mention is `@` + a member slug:

- `@designer`
- `@coder`
- `@everyone` — every **bot** member of that channel (not a license to skip permissions)

Unknown `@foo` is ignored for routing (it may still appear as text). It does not error the post.

Mentions are case-insensitive. Slugs are `[a-z][a-z0-9-]*`.

## Channel post from the human

1. Append `message.posted` to the channel log.
2. Compute `woken = mentioned bot members ∩ channel members`.
3. If `woken` is empty:
   - if the channel has a lead → `woken = [lead]`
   - else → no bot turn
4. Start one turn per woken bot. Turns for the same post run **in parallel**.
5. Bots not in `woken` **wait**. They do not see a “your turn” event.

## Channel post from a bot

Same parse. A bot may `@` others to hand off.

A bot is not auto-woken by its own message. `@everyone` on a bot post wakes every bot member except the author.

**One turn per bot per `say`:** a bot that already completed a turn in this dispatch is not woken again, even if `@`'d. Courtesy CC cannot restart the meeting. A handoff only wakes bots who have not spoken yet. Needing the human is a stop (ask in the channel, no `@`).

## Parallel vs wait

Lead example:

> `@designer` hero’yu yaz. Aynı anda `@coder` API iskeletini kur. Diğerleri beklesin. Bitince `@tester` kır.

- That post wakes `designer` and `coder` now.
- `tester` is mentioned as a *future* instruction in prose, but **also** tagged. If `@tester` is present in the same message, tester wakes now too.

If the lead wants tester later, the lead **must not** `@tester` on this message. When designer/coder finish, they (or the lead) post a new message that `@tester`.

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
