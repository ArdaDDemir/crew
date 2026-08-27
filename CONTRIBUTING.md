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

Irreversible choices go in `docs/adr/` as the next `NNNN-kebab.md`. Accepted ADRs are not rewritten; supersede them.

User-visible change: a bullet under `CHANGELOG.md` `[Unreleased]`.

## Tests

TDD: failing test first, then minimal production code. Domain tests do not call OpenRouter. Use a scripted fake provider.

```
bun test
```
