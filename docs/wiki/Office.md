# Office

The office is the local UI (`bun run ui` or Crew.exe). English chrome. You may write Turkish; people account in English.

## Rooms

A **channel** is a project room, not a chat toy.

Open **room** (or click the line under the channel title) to edit:

| Field | Disk | What |
|---|---|---|
| **About** | `CONTEXT.md` | What this room is building. First line shows under the title. |
| **Rules** | `RULES.md` | How people work in this room. Not a person's Soul. |
| **Files** | `channel.json` `folders` | Workspace-relative path hints. Disk is still the project. |

Empty About: the header says **No About — bots will ask, not invent.** Every turn still gets `(not set)` so they do not invent the product. Fill About before you `@` people to write files.

## Wake

- `@coder` in a channel wakes coder. No `@` on a human post wakes the **lead**.
- Several `@` in one message: those people may run in parallel.
- `@everyone` wakes every bot member except the author.
- `@` inside fenced or inline code is not a wake.
- Unknown `@ghost` does not wake; Crew announces it.
- One turn per person per `say`. If you already named people, a later `@` in that same say is held, not a second wake.

They work at the **desk** (thinking + tools). The channel gets the **account**, not the raw tool dump. Browser screenshots stay on the desk fold.

## Floor

Members desk is a 2.5D room for the open channel.

- Click carpet → walk You (not a wake).
- Click a person → that DM.
- Click a door → that channel.
- Writing walks them to the glass table.
- Owner kit: plant / lamp / sofa / shelf / rug. Guests see it, cannot place.
- Skin / hair / top under the room (You) and on the Person sheet (bots).

## Invites

Top-bar chip. Empty = owner. Paste an invite token to post as that person.

Settings → General: Create invite (token once). Revoke. Guests may `say` / DM / ask / stop. They cannot create people, rooms, or change Settings.

## Composer

Enter sends. Shift+Enter newline. `/help` `/compact` `/status` `/stop` `/mode` … Ctrl+K jump. Right-click a row for Open / Open to the right.
