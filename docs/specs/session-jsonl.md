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

For `dm`, `thread.id` is `botA__botB` with sorted slugs, or `human__bot`.

## Event types (v1)

| type | Who writes it |
|---|---|
| `thread.opened` | engine |
| `message.posted` | human or bot |
| `bot.woken` | engine (routing) |
| `bot.turn.started` | engine |
| `assistant.delta` | engine (stream; desk mutter and account tokens) |
| `tool.requested` | engine |
| `permission.asked` | engine |
| `permission.resolved` | human (via adapter) |
| `tool.completed` | engine |
| `bot.turn.completed` | engine |
| `dm.opened` | engine |
| `error` | engine |
| `thread.compacted` | engine |

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
