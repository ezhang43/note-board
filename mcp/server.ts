import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { boardOutline, collectBoards, findBoard, listBoardsText, type Snapshot } from './boards';

// The BusyAnts connector's tools. Read only in this version: listing boards and reading one.
// Every call reads the boards afresh, so Claude always sees what is saved online now.

const reply = (text: string, isError = false) => ({ content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) });

export function createServer(load: () => Promise<Snapshot>): McpServer {
  const server = new McpServer({ name: 'busyants', version: '1.0.0' });
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  /** Runs a tool, turning any failure (sign-in, network, Firestore) into a plain error message. */
  const safely = async (run: () => Promise<{ text: string; isError?: boolean }>) => {
    try {
      const r = await run();
      return reply(r.text, r.isError);
    } catch (e) {
      return reply(e instanceof Error ? e.message : String(e), true);
    }
  };

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
      inputSchema: { board: z.string().min(1).describe('The board’s id, or its name when only one board has that name') },
      annotations: readOnly,
    },
    ({ board }) =>
      safely(async () => {
        const got = collectBoards(await load());
        const found = findBoard(got.entries, board);
        return 'error' in found ? { text: found.error, isError: true } : { text: boardOutline(got, found.entry) };
      }),
  );

  return server;
}
