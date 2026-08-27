# Skills

Follow [Agent Skills](https://agentskills.io/specification) for files:

```
.crew/bots/<id>/skills/<skill-name>/SKILL.md
```

Frontmatter required: `name`, `description`. Body is the procedure.

Progressive disclosure: catalog (name+description) is always in the prompt; body loads when `/name` is used or the model names that skill.

Channel `RULES.md` / `CONTEXT.md` are not skills. They load on every turn in that channel.

Do not invent a second skill format.
