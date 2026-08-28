# Edge cases (v1 observed + research)

How Crew should treat memory, then a catalog of cases. Live-proven items are marked **HIT**.

## How it should work

Not one giant session. Not two strangers.

| Layer | Rule |
|---|---|
| Identity | `@coder` is one person in channel and DM |
| Files | Disk is shared truth. Re-read. Do not trust a DM that says the file was not changed |
| Channel | Public standup. Other members see it |
| Bot↔bot DM | Private note. Other bots do not see it in the channel |
| Human↔bot DM | Private order to that one bot. Other bots do not see it |
| Human authority | The latest **human** message to that bot wins if channel and DM conflict. Announce the conflict in the account |
| Wake | A channel turn gets a **pointer** that unread DMs exist (not the full DM dump). A DM turn gets the bot’s last channel account line so they do not lie about files |
| Stop | Need-human still stops the channel (`ADR-0014`). A DM is a separate thread, not a way to reopen the meeting |

This matches Discord/Continua (DM stays private in the room) plus “one coworker” (same human, same files). Full merge of every DM into the channel (kern-style) is wrong here: other bots would see private notes, tokens explode, @ cascades return.

**Today:** each thread has its own history. Channel cannot see DMs. **HIT** live: DM said “do not touch index.html”; channel said “set title to FlowHub”; coder followed the channel and patched the file.

---

## 1. Channel vs DM vs files

1. Human DM “never edit files”, then channel “edit the title”. **HIT** (old). **Fixed (`ADR-0016`):** latest human across channel + human↔bot DM wins; the turn gets a pointer, not a dump.
2. Channel “edit the title”, then DM “revert that”. DM turn does not see the channel patch unless it re-reads the file. Should: always read disk first.
3. Human DMs coder “use red”; channel says `@designer` “use blue”. Designer never hears the DM. Coder may still paint red. Split-brain UI.
4. Two human DMs to two bots with opposite file orders in one minute. Both wake, both patch, last write wins (lock only serializes, it does not merge).
5. Bot-bot `dm_send` “keep this secret” then the sender accounts in the channel with the secret. Privacy leak by the speaker, not the engine.
6. Bot-bot DM while the target is also in the same `say` channel wave. Spec allows channel turn **and** DM turn. Tester can answer the room and the DM with two different stories.
7. Unread DM pile-up: 10 private notes, then one channel wake. Today the channel turn is blind to all 10.
8. Human `crew dm coder` then `say` with no `@` (lead only). Coder never hears the lead plan; lead never hears the DM.
9. `dms show` after a channel patch: the DM log still says “I will not touch the file”. Log lies relative to disk.
10. Same text posted in channel and DM. Two wakes, two accounts, possibly two patches of the same hunk.

## 2. Mentions, stop, handoff

11. Human `@designer @coder`; designer’s account `@coder put this in`. Coder does **not** wake (`ADR-0014`). Job half-done until the next `say`.
12. Human no `@` → lead `@designer @coder` → workers run. Their `@tester` does **not** wake. Tester waits for a later human `say`.
13. `@everyone` in a 4-bot room. Four parallel turns, four accounts, four possible file writes.
14. `@Everyone` / `@CODER` — parse is case-insensitive. Fine. `@coder.` with a period — mention boundary may drop it.
15. Unknown `@ghost` ignored. Human thinks someone woke.
16. Bot `@`s itself. Filtered as author. Fine.
17. Human `@lead do not @ anyone` and lead still `@coder` in the account. Engine will not wake coder (human already tagged lead only… wait: human tagged lead, so `humanPicked` true, no handoff). Coder stays asleep. Lead’s @ is decoration.
18. Human message “coder should wait” **without** `@coder`, but `@designer` — coder is not woken (good) unless they were already in the wave.
19. `@tester` inside a fenced code block or URL. **Fixed (`ADR-0043`):** fences, inline code, and URL `/@user` are not wakes.
20. Empty `say landing` / whitespace — usage error. Fine.
21. Very long mention list: 8 waves cap still, but one-turn-per-bot caps at membership size.

## 3. Parallel files and tools

22. Designer and coder `apply_patch` the same `index.html` in one wave. Lock serializes; second patch can fail `old_text not found` or overwrite the first.
23. `old_text` matches twice → tool error. Model may invent a second patch or claim success.
24. Empty `old_text` on existing file. **Fixed:** does not overwrite an existing file.
25. Coder writes via `shell` (`echo > file`) instead of `apply_patch`. **Fixed (`ADR-0044`):** `>` / `>>` and `git` share the `apply_patch` lock.
26. `shell` timeout 30s; hung `npm`. Turn looks stuck; other parallel bot continues.
27. `list_dir` without path lists workspace root including `.crew`? **Fixed (`ADR-0043`):** `list_dir` skips `.crew`, `.git`, `.ssh`, `.env`, `.env.*`. `read` of `.env` is still denied.
28. `read` `.env` denied. Model retries once then account-nudge. Fine if it stops.
29. Path `..\..\Windows\...` outside workspace: auto-accept asks; `say` has no TTY → deny. Model may loop until two denials.
30. Two bots `shell` `git commit` at once. Race on `.git`.
31. UTF-8 vs Windows console: `index.html` was garbled this way once. Live title patch was clean ASCII.

## 4. Identity, prompt, language

32. Other bots’ lines are `user` role labeled `@id`. Weak models still answer as the lead. (Mitigated, not gone.)
33. Human writes Turkish, system says English. Live **HIT:** accounts were English. Long Turkish history in JSONL may pull later turns back to Turkish.
34. Soul says “be terse”, channel context says “write a novel”. Soul vs rules vs human: human should win; today all three are concatenated.
35. Skill catalog only (name + description). **Fixed (`ADR-0021`):** full `SKILL.md` is in the prompt (capped).
36. Standing orders empty `AGENTS.md` on disk. Fine, but looks like a missing file.

## 5. Provider, money, length

37. Two parallel OpenRouter calls. One 429, one OK. Rate gap waits the next **wave**, not the sibling. Sibling already in flight.
38. `Inference processing failed` retries once **without tools**. Account may say they patched when they did not (no second tool round).
39. 45s fetch timeout. User sees hang, then timeout error. Parallel peer may still finish.
40. Context: `buildHistory` used to send **all** `message.posted`. **Fixed (`ADR-0019`, `ADR-0028`):** last 80 + `thread.compacted`; trim posted-only; optional `thread.summary`.
41. Reasoning stored every turn. `--thinking` dump is huge; default `say` hides it. Fine.
42. `maxRounds` 4. Tool, tool, tool, then forced stop with empty account if they never speak. **Fixed (`ADR-0043`):** engine writes `I stopped after N tool call(s) without a channel account.`
43. Empty model text → CLI `ERROR: empty reply`. Fine.

## 6. CLI / UX

44. Parallel stdout: `coder:` may print before `designer:` even if woken list is designer, coder. **HIT.** UI bubbles later.
45. `woke:` line prints **after** the accounts. Looks backwards. **Fixed (0.7.0):** `onWoken` prints before live accounts.
46. `crew dms` is empty until the first DM. **HIT** earlier; not a bug.
47. `say` unknown channel → throw. `dms show` missing thread → `(empty)`. Inconsistent.
48. `open` REPL `/dm` vs `crew dm` — two paths, same engine. Fine if both use `dispatchDm`.
49. `--thinking` on `say` mixes desk into the standup again (user opted in).
50. No `crew stop`. **Fixed:** `/stop` in `crew open` and UI Stop. `shouldStop` drops remaining waves.

## 7. State, membership, time

51. Bot removed from channel but old log still `@`s them. They are not woken (not a member). Orphan @.
52. Two channels, one cwd. Both bots can write `index.html`. No per-channel worktree.
53. `researcher` exists but is not in `#landing`. `@researcher` in landing is ignored.
54. Compact: **fixed** (`ADR-0019`, `ADR-0028`). Over 80 `message.posted`, append `thread.compacted`; LLM compact appends `thread.summary`; JSONL is not rewritten.
55. Clock is ISO now. Replaying logs does not re-run tools. Fine. Re-`say` the same text **does** re-run tools (not idempotent).
56. Permission mode `auto` without reviewer → supervised, warn on stderr. Easy to miss.
57. DM permission is hardcoded `auto-accept` in the turn (not stored on the DM). Cannot `crew mode` a DM. **Fixed (`ADR-0041`):** `dm-prefs.json` `modes`; new DMs use `defaultPermissionMode`; office mode chip and `crew mode <dmId>` work.

---

## Fix order (when we choose to)

Do now if we touch memory: **1, 2, 6, 7, 11** (conflict + unread DM pointer + half-done handoff).

`ADR-0016` covers 1, 2, 7. **`ADR-0044`:** unread DM pointer is count + newest gist after last channel account (not every id). Case 6: no second DM turn if they already spoke this `say`. Case 14 URL `@` is not a wake. Case 24: empty `old_text` will not clobber an existing file. Case 11 still open (half-done handoff is the stop rule). MCP tools ask on auto-accept (`ADR-0044`).

`ADR-0019` covers 40 and 54 (prompt window + `thread.compacted`). `ADR-0028` adds trim + `thread.summary`. `ADR-0044`: `>` / `>>` and `git` share the `apply_patch` lock (22–25 still race other commands). Cancel is `/stop` in `crew open` and the UI Stop button.
