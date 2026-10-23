# BusyAnts connector for Claude

A small program on your computer that lets Claude (Claude Desktop or Claude Code) read your BusyAnts boards, and make changes to your own ones: add, edit, tick and move checklist items; add notes, checklists, columns (containers) and new boards; and, only if you switch it on, delete things (always shown to you first). Boards shared with you (or by you) are shown and marked read-only: Claude can't change them. Notes can only be added, never edited.

You sign in with your own Google account, in your web browser, and the connector works as you: Google's rules for your boards (`firestore.rules`) apply exactly as in the app, so it can only reach your own boards and the ones shared with you. Your sign-in is kept on your computer only, outside any project folder:

- **Windows:** `%APPDATA%\busyants-mcp\token.json`
- **Mac:** `~/.config/busyants-mcp/token.json` (in your home folder; `.config` is hidden in Finder, press Cmd+Shift+. to show it)

The same folder holds `activity.log` (every change the connector made, with the time) and, if you switch deleting on, `settings.json`.

## Install in Claude Desktop (Mac or Windows)

You need [Claude Desktop](https://claude.ai/download) and a Google account you use for BusyAnts. Nothing else: Claude Desktop runs the connector itself.

1. Download `busyants.mcpb` (from the project's Releases page on GitHub).
2. Open it: double-click it, or drag it onto the Claude Desktop window. If neither works, in Claude Desktop open **Settings → Extensions → Advanced settings → Install Extension…** and pick the file.
3. Claude Desktop shows what the extension is: click **Install**. It asks for no keys or settings.
4. In a new chat, ask Claude: **"Sign in to BusyAnts."** Claude asks to use the `sign_in` tool: allow it. A page opens in your web browser: click **Sign in with Google** and pick your account. The page says "Done".
5. Back in Claude, ask: **"List my BusyAnts boards."**

If no page opens in step 4, Claude's answer has the page's address (starting `http://localhost:`): open it in a browser on the same computer. It works once, for 5 minutes.

**Already set the connector up by hand before?** Remove the old `busyants` entry from Claude Desktop's config first (Settings → Developer → Edit Config, delete the `"busyants": { … }` entry inside `"mcpServers"`, save, quit and reopen Claude Desktop), or Claude sees the connector twice. The extension uses the same sign-in file, so you stay signed in.

**Updating:** open the newer `busyants.mcpb` the same way; Claude Desktop replaces the old one.

**To remove it:** ask Claude to "sign out of BusyAnts" (that deletes the saved sign-in), then in Claude Desktop open **Settings → Extensions**, pick BusyAnts and uninstall it.

## What Claude can do

| Tool | What it does |
| --- | --- |
| `list_boards` | Lists your boards (read only) |
| `read_board` | Reads one board as an outline, with ids (read only) |
| `add_items` | Adds items to a checklist: at the end, after an item, or under an item |
| `edit_items` | Changes items' text |
| `set_items_done` | Ticks or unticks items |
| `move_items` | Moves items (with their sub-items) to a place in a checklist on the same board |
| `add_note` | Adds a note: at the end of a column, near a card, or loose on the board |
| `add_checklist` | Adds a checklist (a title and items), placed as a note is |
| `add_column` | Adds an empty column (a container), beside a card or column, or near the top left |
| `create_board` | Makes a new, empty board: inside one of your boards (with a board card opening it), or on its own |
| `preview_delete` | Step 1 of deleting: lists exactly what would be deleted, and deletes nothing |
| `confirm_delete` | Step 2 of deleting: deletes exactly what the preview listed, after you said yes |
| `sign_in` | Opens the sign-in page in your web browser (you sign in there, with Google) |
| `sign_out` | Deletes the saved sign-in on this computer; nothing on your boards changes |

Each change is one save of at most 50 changes, and Claude's answer lists exactly what changed. There is no tool for link cards (BusyAnts has no Add Link).

**Allow prompts:** when Claude asks to use a tool, "Always allow" is fine for `list_boards`, `read_board` and `preview_delete` (they only read). Click plain **Allow** for `sign_in` and `sign_out`, so a sign-in page never opens, and you are never signed out, without you asking. For the tools that change boards (`add_items`, `edit_items`, `set_items_done`, `move_items`, `add_note`, `add_checklist`, `add_column`, `create_board`) click plain **Allow** each time, after reading what Claude is about to do. **Never** click "Always allow" for `confirm_delete`: that prompt is your last check before something is deleted. Text on a board (yours, or pasted from elsewhere) could ask Claude to change things; the prompt is where you catch that.

**Safety:**
- Before Claude's first change (and again after 10 quiet minutes), your boards as they were are saved in version history: open BusyAnts → Version history (the clock button, bottom right) to go back.
- A change is never saved over something you changed after Claude read the board: it is made again on top of your change instead.
- If BusyAnts is open and saves over Claude's change a moment later, the connector puts it back once and says so. If that happens twice, Claude is told the change isn't on the board.
- Every change is written, with the time, to `activity.log` in the sign-in folder above (open it in Notepad or TextEdit).

**Deleting** is off, and Claude can't switch it on. It can only be switched on from a copy of the project (see "From the project's code" below: `npm run mcp:delete-on`, and `npm run mcp:delete-off` to stop it); the setting is the `settings.json` file in the sign-in folder, and it applies to the installed extension too. When it is on:
- Claude first shows you what would be deleted (`preview_delete`), and deletes only after you say yes (`confirm_delete`, once per preview). If anything it would delete changed in between, nothing is deleted.
- Just before deleting, a copy of your boards is saved in version history, so you can always put it back.
- At most 20 things at a time (a column or a board counts as one, with what is inside it).
- Never deleted: your home board, a top-level board (one no card opens), the Completed card, or anything on a shared board.
- A preview works once, for 10 minutes, and is forgotten when Claude Desktop or the connector restarts: ask for a new one.
- Claude Desktop's connector can't change the setting, but Claude Code on the same computer could, like any file. To stop that, add to `permissions.deny` in your own Claude Code user settings: `Bash(npm run mcp:delete-on*)`, and `Edit` / `Write` rules for the sign-in folder, written as its full path followed by `/**`.

## If something goes wrong

- **"Not signed in"**, or **"The sign-in has expired or was revoked"**: ask Claude to "sign in to BusyAnts".
- **"No sign-in within 5 minutes"**: the page waited too long. Ask Claude to sign in again.
- **"Firestore refused (permission denied)"**: the Google account you signed in with can't open those boards. Ask Claude to sign in again, with the right account.
- **The sign-in popup says the domain isn't authorized**: the BusyAnts project must list `localhost` as an authorized domain; tell whoever runs your BusyAnts site.
- **"Safe to edit: no"** (or a change refused with the same reason): reading still works, but Claude won't change anything. Your saved boards hold something this connector doesn't understand (for example, saved by a newer version of the app): install the newest `busyants.mcpb`. For "saved by an older version of the app", open BusyAnts once.
- **"The boards kept changing while saving"**: BusyAnts was saving at the same moment, four times in a row. Ask Claude to try again.
- **Claude's change disappeared**: if you were typing in BusyAnts at the same moment, the app may have saved over it ("most recent wins"). The connector puts it back once; look in the activity log, and ask Claude to read the board and try again.
- **Undo a change**: in BusyAnts, open Version history and restore the version from just before (it was saved before Claude's first change, and always just before a delete).
- **"Deleting is switched off for this connector"**: that is the default (see "Deleting" above).
- **"No preview with id …"** or **"older than 10 minutes"**: each preview works once, for 10 minutes, and they are forgotten when the connector restarts. Ask Claude to preview the delete again.
- **"The board has changed since the preview"**: something that would be deleted was changed (or moved) in between, so nothing was deleted. Ask Claude to preview it again.

## From the project's code (developers, and Claude Code)

You need Node.js 20 or newer and a copy of this project. Run these in the project folder:

1. `npm install`, then `npm run mcp:build` (makes `mcp/dist/server.js`).
2. `npm run mcp:login` (or ask Claude to sign in, as above). `npm run mcp:check` shows your account, your board count, "Safe to edit: yes" and whether deleting is on.
3. **Claude Code:** `claude mcp add --scope user busyants -- node <project folder>/mcp/dist/server.js` (the full path to the project folder), then `claude mcp list` should show `busyants` connected. To make sure it always asks before deleting, add `mcp__busyants__confirm_delete` to `permissions.ask` in your own user settings.
4. **Claude Desktop without the bundle:** Settings → Developer → Edit Config, and add (inside the outer `{ }`, keeping anything already there) `"mcpServers": { "busyants": { "command": "node", "args": ["<project folder>/mcp/dist/server.js"] } }`. Save, quit Claude Desktop fully and open it again. (Use the bundle or this, not both.)
5. **Make the bundle:** `npm run mcp:pack` builds the connector and writes `mcp/dist/busyants.mcpb` (checked against the bundle format as it is made). The bundle's description is `mcp/manifest.json`.

Other commands: `npm run mcp:logout` (deletes the saved sign-in), `npm run mcp:delete-on` / `mcp:delete-off`. After changing the code, run `npm run mcp:build` again and restart Claude Desktop or start a new Claude Code session.

**"Google refused the app's web key here: it is restricted to the site's address"**: the app's web key only works from the BusyAnts site. In Google Cloud console → APIs & Services → Credentials, create an API key, then edit it: under "API restrictions" choose "Restrict key" and tick **Identity Toolkit API**, **Token Service API** and **Cloud Firestore API**; leave "Application restrictions" at None. Then sign in with it: `npm run mcp:login -- --key <the new key>`. Later sign-ins from Claude reuse that key.

The code:
- `mcp/server.ts`: the tools and their limits. `mcp/edits.ts`: each change, made with `src/model/` (pure). `mcp/save.ts`: saving a change (checks, retries, safety version, put-back, activity log). `mcp/boards.ts`: board list, outline and the "safe to edit" check (pure). `mcp/firestore.ts`: reading and writing Firestore over REST (never the Admin SDK). `mcp/auth.ts`: the saved sign-in and id tokens. `mcp/login/`: the sign-in page. `mcp/main.ts`: the commands, the `sign_in` / `sign_out` tools and the delete setting (on only when `settings.json` says `{"allowDelete": true}`). `mcp/manifest.json` and `mcp/pack.mjs`: the Claude Desktop bundle. `mcp/cli.ts`: the built file's starting point. `mcp/sample.ts`: sample boards for the tests.
- Tests: `npm test` (the `mcp/*.test.ts` files; `mcp/fakeFirestore.ts` is a pretend Firestore with the same save conditions). The plan is in `docs/plans/mcp-connector-plan.md`.
- Logs go to stderr only (stdout belongs to Claude). In this project, Claude Code is told not to read the sign-in folder, on Windows or a Mac (`.claude/settings.json`); elsewhere, add `Read(~/AppData/Roaming/busyants-mcp/**)` (Windows) or `Read(~/.config/busyants-mcp/**)` (Mac) to `permissions.deny` in your own Claude Code user settings.
