import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { newId } from '../src/model/cards';
import { readShare } from '../src/model/sharing';
import { boardOutline, collectBoards, findBoard, listBoardsText, type Snapshot } from './boards';
import { addItems, addNote, editItems, moveItems, setItemsDone, type Edit } from './edits';

// The BusyAnts connector's tools: listing boards and reading one, and changing checklist items and
// adding notes on the owner's own boards (shared boards are read-only). Every call reads the boards
// afresh, so Claude always sees what is saved online now; each change is one save.

const reply = (text: string, isError = false) => ({ content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) });

/** Saves an edit to the owner's own boards (save.ts), giving the plain-English answer. */
export type Write = (edit: Edit) => Promise<{ text: string; isError?: boolean }>;

/** At most this many changes in one call (each call is one save). */
export const MAX_CHANGES = 50;
/** At most this many characters in one item's or note's text. */
export const MAX_TEXT = 5000;

const day = z.string().describe('A day, written YYYY-MM-DD');
const itemId = z.string().min(1).describe('An item’s id, as read_board shows it');
const text = z.string().max(MAX_TEXT);

export function createServer(load: () => Promise<Snapshot>, write: Write): McpServer {
  const server = new McpServer({ name: 'busyants', version: '1.1.0' });
  const readOnly = { readOnlyHint: true, openWorldHint: false };
  const changes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  const boardArg = z.string().min(1).describe('The board’s id, or its name when only one board has that name');

  /** Runs a tool, turning any failure (sign-in, network, Firestore) into a plain error message. */
  const safely = async (run: () => Promise<{ text: string; isError?: boolean }>) => {
    try {
      const r = await run();
      return reply(r.text, r.isError);
    } catch (e) {
      return reply(e instanceof Error ? e.message : String(e), true);
    }
  };

  /** Finds the board, refuses shared ones, and saves `make(boardId)` to the owner's boards. */
  const change = (board: string, make: (boardId: string) => Edit) =>
    safely(async () => {
      const snap = await load();
      const found = findBoard(collectBoards(snap).entries, board);
      if ('error' in found) return { text: found.error, isError: true };
      // A board in any share counts as shared, even while an old copy is still in the own boards
      // (just shared): the app shows the share's copy, so a change to the old one would be lost.
      const inShare = snap.shares.some((s) => readShare(s.raw)?.boards[found.entry.id]);
      if (found.entry.sharedBy || inShare) return { text: `${found.entry.name} is a shared board: shared boards are read-only for this connector. Nothing was changed.`, isError: true };
      return write(make(found.entry.id));
    });

  server.registerTool(
    'list_boards',
    {
      title: 'List BusyAnts boards',
      description: 'Lists every BusyAnts board: name, id, the board it sits inside, whether it is the home board or shared (shared boards are read-only), and counts of columns, cards and open checklist items.',
      annotations: readOnly,
    },
    () => safely(async () => ({ text: listBoardsText(collectBoards(await load())) })),
  );

  server.registerTool(
    'read_board',
    {
      title: 'Read a BusyAnts board',
      description:
        'Reads one board as an outline: columns left to right with their cards top to bottom, then loose cards. Checklists show items with ticks, nesting, due dates and ids, and their Completed section; also notes, links, board cards and the Completed card.',
      inputSchema: { board: boardArg },
      annotations: readOnly,
    },
    ({ board }) =>
      safely(async () => {
        const got = collectBoards(await load());
        const found = findBoard(got.entries, board);
        return 'error' in found ? { text: found.error, isError: true } : { text: boardOutline(got, found.entry) };
      }),
  );

  server.registerTool(
    'add_items',
    {
      title: 'Add checklist items',
      description: `Adds items to a checklist on one of your own boards: at the end, right after an item (after), or as the last sub-item of an item (under). Several items keep their order. At most ${MAX_CHANGES} items per call; items nest at most 6 levels deep.`,
      inputSchema: {
        board: boardArg,
        list: z.string().min(1).describe('The checklist’s id, or its title when only one checklist on the board has it'),
        items: z
          .array(
            z.object({
              text: text.min(1).describe('The item’s text (one line)'),
              due: day.optional(),
              after: itemId.optional().describe('Put it right after this item'),
              under: itemId.optional().describe('Put it as the last sub-item of this item'),
            }),
          )
          .min(1)
          .max(MAX_CHANGES),
      },
      annotations: changes,
    },
    ({ board, list, items }) => change(board, (id) => addItems(id, list, items, items.map(() => newId('i')))),
  );

  server.registerTool(
    'edit_items',
    {
      title: 'Edit checklist items',
      description: `Changes items’ text and / or due dates (due: null removes it), by item id, on one of your own boards. At most ${MAX_CHANGES} changes per call.`,
      inputSchema: {
        board: boardArg,
        changes: z
          .array(z.object({ item: itemId, text: text.min(1).optional(), due: day.nullable().optional().describe('A day written YYYY-MM-DD, or null to remove the due date') }))
          .min(1)
          .max(MAX_CHANGES),
      },
      annotations: changes,
    },
    ({ board, changes: list }) => change(board, (id) => editItems(id, list)),
  );

  server.registerTool(
    'set_items_done',
    {
      title: 'Tick or untick checklist items',
      description: `Ticks (done: true) or unticks (done: false) items by id on one of your own boards, as clicking their boxes in the app does. At most ${MAX_CHANGES} items per call.`,
      inputSchema: { board: boardArg, items: z.array(itemId).min(1).max(MAX_CHANGES), done: z.boolean() },
      annotations: changes,
    },
    ({ board, items, done }) => change(board, (id) => setItemsDone(id, items, done)),
  );

  server.registerTool(
    'move_items',
    {
      title: 'Move checklist items',
      description: `Moves items (with their sub-items) to a checklist on the same board: at its end, after or before an item, or as the last sub-items of an item (under). At most ${MAX_CHANGES} items per call; items nest at most 6 levels deep. A list left empty keeps one blank item.`,
      inputSchema: {
        board: boardArg,
        items: z.array(itemId).min(1).max(MAX_CHANGES),
        to: z.object({
          list: z.string().min(1).describe('The checklist’s id, or its title when only one checklist on the board has it'),
          after: itemId.optional(),
          before: itemId.optional(),
          under: itemId.optional(),
        }),
      },
      annotations: changes,
    },
    ({ board, items, to }) => change(board, (id) => moveItems(id, items, to)),
  );

  server.registerTool(
    'add_note',
    {
      title: 'Add a note',
      description:
        'Adds a note card to one of your own boards: at the end of a column (column: its id or title), just below a card or beside a loose card or column (near: its id), or else loose near the board’s top left. Notes can only be added, not edited.',
      inputSchema: {
        board: boardArg,
        text: text.min(1).describe('The note’s text (several lines are fine)'),
        column: z.string().min(1).optional(),
        near: z.string().min(1).optional().describe('A card’s or column’s id'),
      },
      annotations: changes,
    },
    ({ board, text: note, column, near }) => change(board, (id) => addNote(id, note, { column, near }, newId('k'))),
  );

  return server;
}
