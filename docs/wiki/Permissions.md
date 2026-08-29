# Permissions

Four modes on a channel or DM:

| Mode | File writes / workspace shell | MCP / browser |
|---|---|---|
| **supervised** | Ask | Ask |
| **auto-accept** (default) | Allow in workspace | Ask |
| **auto** | Reviewer model; without a reviewer this becomes supervised | |
| **full-access** | Allow (still hard-denies secrets) | Allow |

Always-deny: `.env`, `~/.ssh`, `rm -rf /`, `irm`, `curl|iex`. Browser: `file://`, `chrome://`, `javascript:`, `.env` URLs.

Always-allow fingerprints live in `.crew/permissions.json`. Settings can add or remove one row. New rooms use `defaultPermissionMode`.

Reviewer first token is `ALLOW` / `DENY` / `ASK` only.
