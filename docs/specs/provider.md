# Provider port

```
complete(req: ChatRequest): AsyncIterable<ChatEvent>
```

`ChatRequest`: `model`, `messages`, `tools`, optional `temperature`.

`ChatEvent`: `text-delta` | `tool-call` | `usage` | `error` | `done`.

v1 adapter: HTTP POST `{base_url}/chat/completions` with `Authorization: Bearer`. Default base: OpenRouter.

Tests: `ScriptedProvider` queues `ChatEvent[][]` (one inner array per model HTTP call).
