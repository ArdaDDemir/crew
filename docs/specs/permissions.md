# Permission modes

Mode is stored on the channel or DM. The CLI composer can change it for the current thread.

## Modes

| id | Label | Workspace file write (`apply_patch` under cwd) | `shell` and writes outside cwd |
|---|---|---|---|
| `supervised` | Sor | ask | ask |
| `auto-accept` | Auto-accept | allow | allow (cwd is workspace; `.env`/`.ssh` still deny) |
| `auto` | Auto (reviewer) | reviewer model; risky → ask | reviewer; risky → ask |
| `full-access` | Full access | allow | allow |

Default for a new channel or DM: the workspace `defaultPermissionMode` (Settings → General **New room mode**), else `auto-accept`. Existing rooms keep the mode on their channel/DM sheet.

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

Always is **per-project**, not per-bot: `.crew/permissions.json` (`ADR-0018`). Fingerprint subset: `path`, `command`, `name`, `id`. A matching later ask is allowed with no prompt and no `type:"ask"` stream row. It does not switch the channel to `full-access`.

MCP tools (`mcp_<server>_<tool>`, plus `mcp_<server>_resources_*` / `_prompts_*` when advertised, `ADR-0036` / `ADR-0038`) are `ToolKind` `mcp` (`ADR-0044`): supervised and auto-accept **ask**; full-access allows. Unknown other tools still map to `shell`. Harness CLI turns do not use this card (the CLI auto-approves).

Hard-denied shell (every mode, reviewer skipped): command mentions `.env` or `.ssh`, `rm -rf /`, `irm`, or `curl | iex`.

Settings → Permissions:

- List Always rules from disk.
- **Add:** tool `apply_patch` \| `shell` + path or command. `POST /api/permissions` writes the same `{ tool, key }` shape `rememberAlways` uses.
- Per-row Remove: `DELETE /api/permissions?tool=&key=`.
- Clear all: `DELETE /api/permissions` with no query.
- **Reviewer model** stored as `reviewerModel` in project `config.json`.

## Auto reviewer

If `reviewerModel` is empty, `auto` **falls back to `supervised`**. It must not fall back to `full-access`. When set, `auto` one-shots that model. First token must be `ALLOW` / `DENY` / `ASK` (`YES` and empty → human card, `ADR-0044`). `permission.resolved` includes `reviewer: true` when the model settled it (`ADR-0042`).
