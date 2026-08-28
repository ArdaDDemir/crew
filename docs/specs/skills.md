# Skills

Follow [Agent Skills](https://agentskills.io/specification) for files:

```
.crew/bots/<id>/skills/<skill-name>/SKILL.md
```

Frontmatter required: `name`, `description`. Body is the procedure.

`name` is a slug: lowercase `a-z`, digits, hyphens, 1–64 chars, no leading/trailing/double hyphen. `description` is 1–1024 characters (what it does and when to use it). The UI writes this file on its own Skill sheet (Person lists cards; Add/edit is `#skill-modal`, `ADR-0023`). `crew skill add` writes the same file; `crew skill rm` / Person → Delete removes the skill directory.

The system prompt includes each skill as a full `SKILL.md` (frontmatter + body, capped).

Channel `RULES.md` / `CONTEXT.md` are not skills. They load on every turn in that channel.

Do not invent a second skill format.
