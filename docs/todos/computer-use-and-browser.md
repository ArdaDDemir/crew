# Todo: computer-use + in-app browser

Status: browser tools in (`ADR-0050`). Live desktop mouse still parked.  
Owner: Arda  
Date: 2026-08-27

## What

Codex-style **computer-use** (agent sees/clicks/types on the machine) and an **in-app browser** (preview a page, comment on it, iterate).

## Why later

Crew’s v1 office is channels + people + DMs + file/shell hands on **cwd**. Computer-use and a browser are a new adapter (screen, input, cookies, passkeys). They are not Discord familiarity and they are not the composer gaps.

## When to pick up

After: jump palette, message actions, `@file`, visible diffs, plan card, split panes. Then write an ADR (next free number) before any code.

## Do not

Do not start in the familiar-UI program. Do not pull in Electron solely for this.

Related parked: `docs/todos/multi-human-remote.md` (`crew serve`).
