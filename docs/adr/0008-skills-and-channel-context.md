---
status: accepted; skill loader qualified by ADR-0021
date: 2026-08-27
decision-makers: Arda
---

# Skills + channel rules/context as markdown

## Context and Problem Statement

Bots need a voice and procedures. Channels need standing orders too, or every room becomes the same soup.

## Decision Outcome

Chosen option: "Markdown packs, not a new YAML format".

- Bot: `SOUL.md` (voice), `AGENTS.md` (standing orders), `skills/*/SKILL.md` (Agent Skills spec: name + description required)
- Channel: `RULES.md` (how we talk and who may do what in this room), `CONTEXT.md` (what this room is about, relevant paths, current goal)

Skills are procedures. Soul is voice. Channel rules are the room’s law. Do not merge them into one blob.

v1 skill loader: index `name`+`description` in the system prompt; load the body when the bot is asked to use that skill or the user types `/name`.

### Confirmation

`docs/specs/skills.md`. Channel files are loaded into every turn in that channel.
