# Provider port

```
complete(req: ChatRequest): AsyncIterable<ChatEvent>
```

`ChatRequest`: `model`, `messages`, `tools`. Internal assistant `tool_calls` are `{id, name, arguments}`.

`ChatEvent`: `text-delta` | `reasoning-delta` | `tool-call` | `error` | `done`.

v1 adapter: HTTP POST `{base_url}/chat/completions` with `Authorization: Bearer`. Default base: OpenRouter. Wire `tool_calls` are OpenAI-shaped `{id, type:"function", function:{name, arguments}}` (`toOpenAiMessages`). Request includes `reasoning: { enabled: true }`. Fetch timeout 45s. 429/5xx retried. `Inference processing failed` is retried once by the turn loop **without** tools.

Settings may store Claude / Codex / Grok / OpenCode as a Person or Jobs **harness** (`ADR-0030`, `ADR-0031`). Person turns (and workspace default) spawn that CLI when the Providers card is enabled (`ADR-0034`, `ADR-0035`): Grok `grok --prompt-file --output-format streaming-json --always-approve`; Claude `claude -p --output-format stream-json --permission-mode bypassPermissions`; Codex `codex exec --json --sandbox workspace-write`; OpenCode `opencode run --format json --auto`. Core still has no `child_process`. Jobs stay OpenRouter. MCP stdio tools (`ADR-0036`) are extra Crew tools on OpenRouter turns only. Unit tests inject a fake runner / fake MCP RPC; they never call the real CLIs or a marketplace.

Tests: `ScriptedProvider` queues `ChatEvent[][]` (one inner array per model HTTP call).
