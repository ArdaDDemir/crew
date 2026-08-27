# Provider port

```
complete(req: ChatRequest): AsyncIterable<ChatEvent>
```

`ChatRequest`: `model`, `messages`, `tools`. Internal assistant `tool_calls` are `{id, name, arguments}`.

`ChatEvent`: `text-delta` | `reasoning-delta` | `tool-call` | `error` | `done`.

v1 adapter: HTTP POST `{base_url}/chat/completions` with `Authorization: Bearer`. Default base: OpenRouter. Wire `tool_calls` are OpenAI-shaped `{id, type:"function", function:{name, arguments}}` (`toOpenAiMessages`). Request includes `reasoning: { enabled: true }`. Fetch timeout 45s. 429/5xx retried. `Inference processing failed` is retried once by the turn loop **without** tools.

Tests: `ScriptedProvider` queues `ChatEvent[][]` (one inner array per model HTTP call).
