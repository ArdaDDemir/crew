---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# AGENTS.md is the agent-facing law

## Context and Problem Statement

Different tools look for different filenames (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Cursor rules, Copilot instructions). If each copy is a novel, they will drift and the next agent will “mal olmak”.

## Decision Outcome

Chosen option: **one canonical `AGENTS.md`**. Other files are pointers plus a 10-line STOP list so a tool that only loads its own filename still does not scaffold discord.js.

| File | Who reads it |
|---|---|
| `AGENTS.md` | Codex, OpenCode, Grok, Continue, most CLIs |
| `CLAUDE.md` | Claude Code |
| `GEMINI.md` | Gemini CLI |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.cursor/rules/crew.mdc` | Cursor |
| `.grok/rules/crew.md` | Grok extra rules dir |
| `.claude/rules/crew.md` | Claude extra rules dir |
| `packages/core/AGENTS.md` | Anyone working under core |

If a pointer disagrees with `AGENTS.md`, AGENTS.md wins and the pointer is fixed in the same change.

### Confirmation

Root `AGENTS.md` exists. Pointers exist. New agent-facing rules go into `AGENTS.md` first.
