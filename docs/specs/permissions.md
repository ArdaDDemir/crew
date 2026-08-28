# Permission modes

Mode is stored on the channel or DM. The CLI composer can change it for the current thread.

## Modes

| id | Label | Workspace file write (`apply_patch` under cwd) | `shell` and writes outside cwd |
|---|---|---|---|
| `supervised` | Sor | ask | ask |
| `auto-accept` | Auto-accept | allow | allow (cwd is workspace; `.env`/`.ssh` still deny) |
| `auto` | Auto (reviewer) | reviewer model; risky → ask | reviewer; risky → ask |
| `full-access` | Full access | allow | allow |

Default for a new channel or DM: `auto-accept`.

## Hard denials (all modes)

Path jail:

- Refuse `.env`, `.env.*`, `**/.ssh/**`, `**/id_rsa*`, credential files we list in core
- Refuse path escape from workspace unless mode is `full-access` **and** the human approved that specific path at least once this session (`full-access` still cannot read `~/.ssh`)

## Ask flow

Tool executor does not read stdin.

1. Policy says ask → emit `permission.asked`
2. Driving adapter (CLI or web) collects yes / no / always
3. `permission.resolved`
4. Continue or skip with a tool error result to the model

Always is **per-project**, not per-bot: `.crew/permissions.json` (`ADR-0018`). Fingerprint subset: `path`, `command`, `name`, `id`. A matching later ask is allowed with no prompt and no `type:"ask"` stream row. Settings → Always allow lists and clears them. It does not switch the channel to `full-access`.

## Auto reviewer

v1: if no reviewer model is configured, `auto` **falls back to `supervised`** and the CLI warns once. It must not fall back to `full-access`.
