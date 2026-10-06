# Plan: a BusyAnts connector for Claude (local MCP server), approved by the owner 2026-10-06 ("yes to all")

## Owner decisions
1. Sign-in: one-time Google sign-in in the browser (`npm run mcp:login`, a localhost page using the app's Firebase project and `signInWithPopup`, one-time nonce in the address). The Firebase refresh token is kept in `%APPDATA%\busyants-mcp\token.json` (outside the repo, protected by Windows file permissions; `// simple:` upgrade to Windows Credential Manager if the computer is ever shared). `npm run mcp:logout` deletes it. Add a Claude Code deny rule so Claude can't read that file. The Admin SDK / service accounts are ruled out because they bypass firestore.rules.
2. Shared boards are read-only in v1.
3. Accept the gap: own-board sync is "most recent wins", so an AI change can lose to the app if the owner types at the same moment. The connector re-reads a few seconds after each save, puts its change back once (ids are made up front, so nothing doubles), then reports if it's still gone. Optional job C later: own-board sync combines edits with merge.ts.
4. Caps: 50 changes per tool call (each call = one save); 5,000 characters per item or note text; refuse a save over 900,000 characters. Version rule: a safety version before the first AI change, then again after 10 quiet minutes (the app's `needsVersion`), with `contentHash` dedupe.
5. Notes: add only in v1, no editing.

## How it works
- Auth: refresh token → `securetoken.googleapis.com/v1/token?key=<apiKey>` (grant_type=refresh_token) → id_token (1 h) → `Authorization: Bearer` on Firestore REST, so firestore.rules apply. No rules change. If the web API key is restricted to the site's address, `mcp:check` reports it, and the owner creates a second key limited to the Token Service and Firestore APIs.
- Read: `GET .../projects/note-board-a672a/databases/(default)/documents/boards/{uid}` → `fields.data.stringValue` + `updateTime`, parsed with the app's `readWorkspace`. Shares: `boards/{uid}/shared` + `shared/{id}` with `readShare`.
- Write (job B): `documents:commit` with update `{data, client: 'mcp-…'}` + `currentDocument.updateTime` precondition + `updatedAt` REQUEST_TIME transform (rules: hasOnly data/client/updatedAt). On FAILED_PRECONDITION re-read and retry, max 3.
- Round-trip guard: refuse writes unless `serializeWorkspace(readWorkspace(raw).ws)` deep-equals raw (a newer app version would otherwise lose fields). Legacy / damaged data is read-only.
- Every edit goes through `src/model/` pure functions (createItem/insertItems/editItems, setItemText, withDue, setItemsDone, moveItems, createCard('note')+addCard, spotForNewBlock with estimateHeight), then `problems(board)` must be empty, else nothing is saved.
- Safety version: `runQuery` for the newest `versions` entry, compare `contentHash(raw)`; if different, one commit writing `versionData/{id}` then `versions/{id}`. Never delete versions (the app trims).
- Activity log: `%APPDATA%\busyants-mcp\activity.log`, plain lines with time.
- Tool annotations: read tools readOnlyHint; write tools destructiveHint false. Errors come back as isError text; logging goes to stderr only.

## Tools
- list_boards(): name, id, parent, home?, shared? (by whom, read-only), counts.
- read_board(board): outline: columns left to right with cards top to bottom, then loose cards; checklists with items (ticks, due dates, ids) and Completed; notes; links; board cards; ids included.
- (job B) add_items(board, list, items[{text, due?, after?, under?}])
- (job B) edit_items(board, changes[{item, text?, due?|null}])
- (job B) set_items_done(board, items[], done)
- (job B) move_items(board, items[], to{list, after?|before?|under?}), same board, max 6 levels
- (job B) add_note(board, text, column? | near?)
Boards and lists can be named by id, or by name when it's unique; ambiguous names return the choices.

## Code and tests
- `mcp/server.ts` (McpServer + StdioServerTransport), `mcp/boards.ts` (pure), `mcp/firestore.ts` (fetch), `mcp/auth.ts`, `mcp/login/`. Imports `src/model/` directly. Built with Vite to `mcp/dist/server.js` (`npm run mcp:build`); `mcp/dist/` gitignored.
- New deps: `@modelcontextprotocol/sdk` (stable 1.x, pinned) and `zod` (check which version the SDK wants).
- Tests (rule 3, failing first): `mcp/*.test.ts` added to Vitest include and tsconfig. Covers each tool on sample boards, a fake in-memory Firestore with the precondition behaviour, round-trip, caps, refusing shared/legacy, and tool-level tests via the SDK's in-memory client. No Firestore emulator. `npm run mcp:check`: read-only real check, prints board count and "safe to edit: yes/no".
- Job A: medium review + security check. Job B: high-risk label, high review, waits for the owner. Add `mcp/` to the risky list in `scripts/publish-rules.mjs` (job B).

## Owner setup (to go in mcp/README.md)
1. `npm install`, `npm run mcp:build`.
2. `npm run mcp:login`: Sign in with Google in the tab that opens; it says "Done, you can close this tab".
3. `npm run mcp:check`: it should show your board count and "safe to edit: yes".
4. Claude Desktop: Settings → Developer → Edit Config → add `{"mcpServers":{"busyants":{"command":"node","args":["C:\\Users\\ezhan\\Projects\\note-board\\mcp\\dist\\server.js"]}}}` → save → quit from the tray and reopen → ask "List my BusyAnts boards."
5. Claude Code: `claude mcp add --scope user busyants -- node C:\Users\ezhan\Projects\note-board\mcp\dist\server.js`, then `claude mcp list`.
6. Allow prompts: "Always allow" for list_boards and read_board; plain "Allow" for writes.
7. To stop: `npm run mcp:logout` and remove the config entry / `claude mcp remove busyants`.
