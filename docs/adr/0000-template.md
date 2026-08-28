---
status: "{proposed | rejected | accepted | deprecated | superseded by ADR-NNNN}"
date: YYYY-MM-DD
decision-makers: Arda
---

# {short title}

## Context and Problem Statement

{Why does this need a decision?}

## Decision Drivers

- {driver 1}
- {driver 2}

## Considered Options

- {option 1}
- {option 2}

## Decision Outcome

Chosen option: "{option}", because {reason}.

### Consequences

- Good, because {upside}
- Bad, because {downside}

### Confirmation

{Where in code / tests / specs is this enforced?}

Accepted files are immutable except `status` and a superseded/qualified-by link. Next number in `docs/adr/README.md`. English, like the rest of this folder.
