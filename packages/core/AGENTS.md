# `@crew/core`

Domain only. If you need `fetch`, `process.argv`, Discord, or `console.log` as the product, you are in the wrong package.

## May live here

- Bot / channel / DM types
- `parseMentions`, `routeWakes`, `routeDmWake`
- Turn loop that talks to **ports**
- Permission policy (pure)
- Event types

## Must not live here

- OpenRouter / HTTP clients
- JSONL filesystem details (port + adapter)
- CLI flags, Ink, prompts
- Real `child_process` (inject a `ShellPort`)

## Tests

`bun test` in this package. Scripted fake `Provider`. No network.
