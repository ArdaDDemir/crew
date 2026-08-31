# Provider port

```
complete(req: ChatRequest): AsyncIterable<ChatEvent>
```

`ChatRequest`: `model`, `messages`, `tools`, `effort?`. Internal assistant `tool_calls` are `{id, name, arguments}`.

`ChatEvent`: `text-delta` | `reasoning-delta` | `tool-call` | `error` | `done`.

v1 adapter: HTTP POST `{base_url}/chat/completions` with `Authorization: Bearer`. Default base: OpenRouter. Wire `tool_calls` are OpenAI-shaped `{id, type:"function", function:{name, arguments}}` (`toOpenAiMessages`). Request includes `reasoning: { enabled: true }` and, when the person sets an effort, `reasoning_effort: <effort>` (absent otherwise). Fetch timeout 45s. 429/5xx retried. `Inference processing failed` is retried once by the turn loop **without** tools.

Settings may store Claude / Codex / Grok / OpenCode as a Person or Jobs **harness** (`ADR-0030`, `ADR-0031`). Person turns (and workspace default) spawn that CLI when the Providers card is enabled (`ADR-0034`, `ADR-0035`): Grok `grok --prompt-file --output-format streaming-json --always-approve`; Claude `claude -p --output-format stream-json --permission-mode bypassPermissions`; Codex `codex exec --json --sandbox workspace-write`; OpenCode `opencode run <brief-positional> --format json --auto`. Core still has no `child_process`. Jobs stay OpenRouter. MCP tools, resources, and prompts (`ADR-0036`, `ADR-0038`) are extra Crew tools on OpenRouter turns only. Unit tests inject a fake runner / fake MCP RPC; they never call the real CLIs or a marketplace.

Harness spawn contract details:
- **OpenCode**: the Crew brief is the **first positional after `run`** — opencode's `--file` is a yargs array option and would swallow a trailing message as a second attachment (`File not found`). With no model set, the default is `opencode/big-pickle` (tool-capable; provider auto-routing picks endpoints without tool use). An effort on the person is passed as `--variant <effort>`.
- **stderr is drained** for every harness spawn (an unread pipe can block the child). If a CLI exits non-zero **without any parsed stdout event**, the error event is `<Label> exited <code>: <last stderr line>` so real causes (auth, model-not-found) surface instead of a bare exit code.
- Parse events: OpenCode `{"type":"text","part":{"text"}}` / `{"type":"error","error":{...}}` (message also read from `error.data.message`); Claude stream-json assistant/result; Codex exec --json deltas; Grok streaming-json.

Tests: `ScriptedProvider` queues `ChatEvent[][]` (one inner array per model HTTP call).
