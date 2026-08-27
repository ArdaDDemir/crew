---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# SemVer 0.x until 1.0

## Context and Problem Statement

The architecture will move. Shipping 1.0 now would lie.

## Decision Outcome

Chosen option: "Start at 0.1.0; breaking changes bump minor until 1.0". Policy: `docs/versioning.md`. Changelog: Keep a Changelog at repo root.

### Confirmation

`package.json` version, `CHANGELOG.md`, git tags `v0.N.N`.
