# Session JSONL

One JSON object per line. Never rewrite a line. `v` is required.

```json
{
  "v": 1,
  "id": "evt_...",
  "ts": "2026-08-27T12:00:00.000Z",
  "thread": { "kind": "channel", "id": "landing" },
  "type": "message.posted",
  "parent": null,
  "payload": {}
}
```

`thread.kind` is `channel` | `dm`.

For `dm`, `thread.id` is `botA__botB` (sorted) or `human__bot`. Extra human chats with the same person: `human__bot__<slug>` (`ADR-0025`). Old two-part ids stay valid.

## Event types (v1)

| type | Who writes it |
|---|---|
| `thread.opened` | engine |
| `message.posted` | human or bot |
| `bot.woken` | engine (routing) |
| `bot.turn.started` | engine |
| `assistant.delta` | engine (desk mutter **and** account tokens; not the channel bubble) |
| `assistant.reasoning` | engine (thinking; live only with `--thinking`) |
| `tool.requested` | engine |
| `permission.asked` | engine |
| `permission.resolved` | human (via adapter) |
| `tool.completed` | engine |
| `bot.turn.completed` | engine |
| `dm.opened` | engine |
| `error` | engine |
| `thread.compacted` | engine (`ADR-0019`; prompt window, JSONL stays) |
| `thread.summary` | engine (`ADR-0028`; LLM compact, JSONL stays) |
| `thread.titled` | engine (`ADR-0029`; DM title job, JSONL stays) |

`message.posted` from a bot is the **account** after desk work (`ADR-0012`). Tool-round mutter stays in `assistant.delta`, not in `message.posted`.

Unknown `type` values: skip, do not crash. Additive types are a patch/minor; renaming a type is a 0.x minor break.

## `message.posted` payload

```json
{
  "author": { "kind": "human" } ,
  "text": "@designer hero yaz @coder api kur",
  "mentions": ["designer", "coder"]
}
```

Author kind: `human` | `bot`. Bot authors include `botId`.

## `thread.compacted` payload

```json
{ "keptFrom": "evt_...", "dropped": 12 }
```

Prompt readers start at `keptFrom` (a `message.posted` id) and keep at most 80 messages (`ADR-0019`). The log file is not truncated.

## `thread.summary` payload

```json
{ "text": "User intent: …", "keptFrom": "evt_...", "model": "z-ai/glm-5.3-flash", "botId": null }
```

Latest summary is a user note in the prompt, then windowed `message.posted` after `keptFrom` (verbatim). `tool.completed` bodies stay out of `buildHistory` (`ADR-0028`). The log file is not truncated. Empty model text is not stored.

## `thread.titled` payload

```json
{ "title": "Hello Coder", "description": "First hello in Direct.", "model": "z-ai/glm-5.3-flash", "botId": null }
```

Append-only. Last event wins. Title ≤ 48 chars. Description is one line. Direct list prefers this over the first-message gist (`ADR-0029`). The log file is not truncated.
