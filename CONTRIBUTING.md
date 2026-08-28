# Contributing

Read [`AGENTS.md`](./AGENTS.md) first. That file is what other AIs must follow.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>
```

Types we use: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.

Breaking: `feat!:` or a `BREAKING CHANGE:` footer. In 0.x that is a **minor** bump. See `docs/versioning.md`.

## Architecture decisions

Irreversible choices go in `docs/adr/` as the next `NNNN-kebab.md` (index: `docs/adr/README.md`, currently **0036**). Accepted ADRs are not rewritten; supersede or qualify them.

User-visible change: a bullet under `CHANGELOG.md` `[Unreleased]`. Current version is root `package.json` (**0.8.0**). Release ritual: `docs/versioning.md`.

## Tests

TDD: failing test first, then minimal production code. Domain tests do not call OpenRouter. Use a scripted fake provider.

```
bun test
bun run ui
```

Local UI: `http://127.0.0.1:7734`. Core tests never call OpenRouter.

With `bun run ui` already up:

```
bun run tour/visual.ts
```

Chrome headless checks jump, context menu, Settings (Providers / Jobs / MCP), and slash palette.
