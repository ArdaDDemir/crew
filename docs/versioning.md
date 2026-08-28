# Versioning (0.x)

Current release: **0.4.0** (`package.json`, tag `v0.4.0`). Newer work after that lives in `CHANGELOG.md` `[Unreleased]`. Version lives in the root `package.json` only. No `VERSION` file. Started at 0.1.0.

Until 1.0, the public surface may change. We still announce breaks.

## What counts as public API

1. CLI flags and subcommands
2. Config file schema (`.crew/config.json`, `~/.crew/config.json`, `.crew/jobs.json`, `.crew/providers.json`, `.crew/permissions.json`)
3. Session JSONL `v` field and event `type` set
4. Skill / bot / channel markdown frontmatter we honor
5. Permission mode names

## Bumps

| Change | Version |
|---|---|
| Bugfix, docs, internal refactor | patch (`0.1.0` → `0.1.1`) |
| User-visible feature | minor (`0.1.1` → `0.2.0`) |
| Break a public API item above | minor (`0.1.x` → `0.2.0`) until 1.0 |
| Promise we will keep the API a year | only then `1.0.0` |

1.0 requires: CLI + config + JSONL + ports frozen, and a second adapter (desktop or Discord) using the same core without rewriting it.

## Commits

Conventional Commits on squash to `main`:

- `fix:` → patch
- `feat:` → minor if user-visible, else patch
- `feat!:` or `BREAKING CHANGE:` → always minor in 0.x

## Release ritual

1. Move `[Unreleased]` in `CHANGELOG.md` to `[0.N.0] - YYYY-MM-DD`
2. Bump `package.json` version
3. Commit `chore: release 0.N.0`
4. Tag `v0.N.0`
