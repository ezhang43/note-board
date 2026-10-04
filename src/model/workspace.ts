import { createBoard, deleteBlocks } from './board';
import { BOARD_VERSION, readBoard, readBoardData } from './persist';
import type { Board } from './types';

// Several boards, and boards inside boards (owner request, 2026-10-05). Every board is kept and
// saved together, as one "workspace"; one of them is the home board, which is never deleted. A
// board is "inside" another when that one has a board card opening it.

export interface Workspace {
  /** The board everything starts from: never deleted. */
  home: string;
  boards: Record<string, Board>;
}

/** Which board is open, remembered on each device (not synced: each device can show its own). */
export const OPEN_BOARD_KEY = 'note-board:open';
/** The id the home board gets when an older single board is read. */
export const HOME_ID = 'home';
/** Saved shape of a workspace: { version: 3, home, boards } (each board as in version 2). */
export const WORKSPACE_VERSION = 3;

export function serializeWorkspace(ws: Workspace): string {
  return JSON.stringify({ version: WORKSPACE_VERSION, home: ws.home, boards: ws.boards });
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Reads saved data: a workspace, or a single board saved before there were several (then it is
 * the home board, and `legacy` is true). Null when it can't be read at all (damaged, or saved by
 * a newer version of the app).
 */
export function readWorkspace(raw: string | null): { ws: Workspace; legacy: boolean } | null {
  const single = readBoard(raw);
  if (single) return { ws: { home: HOME_ID, boards: { [HOME_ID]: single } }, legacy: true };
  let data: unknown;
  try {
    data = raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data) || data.version !== WORKSPACE_VERSION || !isObject(data.boards)) return null;
  const boards: Record<string, Board> = {};
  for (const [id, b] of Object.entries(data.boards)) {
    const board = readBoardData(BOARD_VERSION, b);
    if (board) boards[id] = board;
  }
  const ids = Object.keys(boards);
  if (!ids.length) return null;
  const home = typeof data.home === 'string' && boards[data.home] ? data.home : ids[0];
  return { ws: { home, boards }, legacy: false };
}

/** Reads saved data; anything unreadable gives a fresh workspace with one empty board. */
export function parseWorkspace(raw: string | null): Workspace {
  return readWorkspace(raw)?.ws ?? { home: HOME_ID, boards: { [HOME_ID]: createBoard() } };
}

/** The boards that `board`'s board cards open, in board order (a column's cards in its place). */
export function boardLinks(board: Board): string[] {
  const out: string[] = [];
  const visit = (id: string) => {
    const card = board.cards[id];
    if (card?.kind === 'board' && !out.includes(card.boardId)) out.push(card.boardId);
  };
  for (const id of board.order) {
    const col = board.columns[id];
    if (col) col.cardIds.forEach(visit);
    else visit(id);
  }
  return out;
}

/** Boards that some board card opens. */
function linkedBoards(ws: Workspace): Set<string> {
  const linked = new Set<string>();
  for (const [id, board] of Object.entries(ws.boards)) for (const to of boardLinks(board)) if (to !== id && ws.boards[to]) linked.add(to);
  return linked;
}

/**
 * The board list, in the order the Boards menu shows it: the home board and the boards inside it
 * (each indented under the board that opens it), then each board that no card opens, with its own.
 * Every board is listed once, even when boards open each other.
 */
export function boardTree(ws: Workspace): { id: string; depth: number }[] {
  const rows: { id: string; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (seen.has(id) || !ws.boards[id]) return;
    seen.add(id);
    rows.push({ id, depth });
    for (const to of boardLinks(ws.boards[id])) walk(to, depth + 1);
  };
  walk(ws.home, 0);
  const linked = linkedBoards(ws);
  for (const id of Object.keys(ws.boards)) if (!linked.has(id)) walk(id, 0);
  // Boards only opened from each other (a loop away from every top board).
  for (const id of Object.keys(ws.boards)) walk(id, 0);
  return rows;
}

/** The boards from the top down to `id` (as listed by boardTree), for going back up. */
export function pathTo(ws: Workspace, id: string): string[] {
  const rows = boardTree(ws);
  const at = rows.findIndex((r) => r.id === id);
  if (at < 0) return [id];
  const path = [id];
  let depth = rows[at].depth;
  for (let i = at - 1; i >= 0 && depth > 0; i--) {
    if (rows[i].depth === depth - 1) {
      path.unshift(rows[i].id);
      depth--;
    }
  }
  return path;
}

/**
 * Deletes board `id` and every card that opens it, on every board. Boards inside it are kept (they
 * then stand alone). The home board is never deleted.
 */
export function withoutBoard(ws: Workspace, id: string): Workspace {
  if (id === ws.home || !ws.boards[id]) return ws;
  const boards: Record<string, Board> = {};
  for (const [bid, board] of Object.entries(ws.boards)) {
    if (bid === id) continue;
    const cards = Object.values(board.cards).filter((c) => c.kind === 'board' && c.boardId === id).map((c) => c.id);
    boards[bid] = cards.length ? deleteBlocks(board, cards) : board;
  }
  return { ...ws, boards };
}

/** An empty, unnamed board that isn't home and that no card opens: a new board left unused. */
export function isLeftoverBoard(ws: Workspace, id: string): boolean {
  const b = ws.boards[id];
  if (!b || id === ws.home || b.name.trim() || b.order.length || Object.keys(b.cards).length) return false;
  return !linkedBoards(ws).has(id);
}
