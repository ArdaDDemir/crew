---
status: accepted
date: 2026-08-29
decision-makers: Arda
---

# Guest invite cannot write the office

## Context and Problem Statement

`ADR-0054` locked invite mint/revoke to the tokensuz owner. A valid guest Bearer could still `POST /api/bots`, attach files, and change Settings. The chip labeled the person `invite`, not their handle. Discord outbound that exhausted eight 429s dropped the account with no log. Public `0.0.0.0` stays parked.

## Decision Outcome

Qualifies `ADR-0047`, `ADR-0048`, `ADR-0054`.

1. Missing token on loopback is still the owner. A valid guest Bearer may `POST /api/say`, `/api/dm`, `/api/permission`, `/api/stop`, and all GET reads. Every other POST/PUT/PATCH/DELETE is HTTP 403 `{ error: "owner only" }`. Invalid Bearer is 401.
2. `GET /api/who` returns `{ id, handle, owner }`. Empty token is `{ id: "human", handle: "owner", owner: true }`. The identity chip shows that handle.
3. Discord outbound that is still 429 after eight attempts calls `onDrop(dest)` (stderr warn). Crew JSONL/wake already finished.
4. Not this ADR: public bind, live desktop mouse, treating omitted token as a guest (loopback owner stays).

### Confirmation

`apps/web` guest bot create 403, `/api/who`, Discord queue `onDrop`, CHANGELOG `[Unreleased]`.
