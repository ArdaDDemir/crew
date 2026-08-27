# aibuildingapp (`crew`)

Local multi-bot runtime. You create bots and channels. A lead assigns work with `@`. Mentioned bots act (in parallel if several are tagged). The rest wait. Bots can talk in the channel or DM each other.

CLI first. GUI later, same core.

- Design: `docs/superpowers/specs/2026-08-27-crew-runtime-design.md`
- Decisions: `docs/adr/`
- Contracts: `docs/specs/`
- Versions: `docs/versioning.md` · `CHANGELOG.md`

Stack: TypeScript + Bun. Tests: `bun test`.

```
bun install
bun test
```
