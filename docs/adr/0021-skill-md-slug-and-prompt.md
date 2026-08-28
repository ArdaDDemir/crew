---
status: accepted; UI editor is its own sheet (ADR-0023)
date: 2026-08-27
decision-makers: Arda
---

# SKILL.md is slug + frontmatter; the prompt gets the whole file

## Context and Problem Statement

`ADR-0008` said the prompt only gets `name`+`description` and loads the body later. Bots hallucinated procedures. The UI treated skills as three loose fields. Agent Skills requires `name` as a slug and YAML frontmatter.

## Decision Outcome

Chosen option: write and read Agent Skills `SKILL.md` only.

- `name`: lowercase `a-z0-9-`, 1–64, no leading/trailing/double hyphen. Display names like `HTML Pages` slug to `html-pages`.
- `description`: 1–1024 characters (what + when).
- Body: markdown procedure after the `---` fence.
- Path: `.crew/bots/<id>/skills/<name>/SKILL.md`.
- The system prompt includes each of that bot’s full `SKILL.md` (capped). Catalog-only is parked until a large library needs progressive disclosure.
- Human: UI edit/delete, `crew skill add|rm|show|copy`. Agents: `skill_acquire` (copy if it exists, else self-write only).

### Confirmation

`packages/core/src/skill-md.ts`, `docs/specs/skills.md`.
