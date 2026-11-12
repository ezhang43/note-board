import { addCard, createBoard } from './board';
import { createCard } from './cards';
import type { Board, TodoCard } from './types';
import { boardTree, type Workspace } from './workspace';

// The main checklist (owner request, 2026-11-12): the Checklist button opens one checklist in a panel
// on the left. It is kept, like the Journal and Habits, on an ordinary board, called "Main checklist",
// holding one checklist card, so saving, sync, undo, backups and Version history work as for any
// board, and nothing new is written in the save.

/** The board the Checklist panel uses. */
export const CHECKLIST_NAME = 'Main checklist';
/** The title of the checklist card on it (the panel doesn't show it). */
export const CHECKLIST_TITLE = 'Checklist';

/** A new Main checklist board: one checklist with one blank item, made when the panel first opens. */
export function newChecklistBoard(): Board {
  const card: TodoCard = { ...(createCard('todo') as TodoCard), title: CHECKLIST_TITLE };
  return addCard({ ...createBoard(), name: CHECKLIST_NAME }, card, { type: 'loose', x: 0, y: 0 });
}

/** The first board named exactly "Main checklist" among the person's own boards (not one a share holds), or null. */
export function findChecklistBoard(ws: Workspace, shared: string[]): string | null {
  // simple: with several boards of that name (two devices made one each before syncing) the first in the menu is used and the other stays listed; they are not merged.
  return boardTree(ws).find(({ id }) => ws.boards[id].name === CHECKLIST_NAME && !shared.includes(id))?.id ?? null;
}

/** The checklist the panel shows: the one with the lowest id, so every device picks the same one. */
export function checklistCardOf(board: Board): TodoCard | null {
  const lists = Object.values(board.cards).filter((c): c is TodoCard => c.kind === 'todo');
  return lists.sort((a, b) => (a.id < b.id ? -1 : 1))[0] ?? null;
}

/**
 * The Main checklist board, left out of the Boards menu: only while it holds nothing the panel doesn't
 * show (one checklist and the Completed record), isn't home, and no board card opens it. Otherwise it
 * is listed, so nothing on it is out of sight.
 */
export function hiddenChecklist(ws: Workspace, shared: string[]): string | null {
  const id = findChecklistBoard(ws, shared);
  if (!id || id === ws.home) return null;
  const board = ws.boards[id];
  const cards = Object.values(board.cards);
  const lists = cards.filter((c) => c.kind === 'todo').length;
  if (Object.keys(board.columns).length || lists > 1 || !cards.every((c) => c.kind === 'todo' || c.kind === 'completed')) return null;
  const opened = Object.values(ws.boards).some((b) => Object.values(b.cards).some((c) => c.kind === 'board' && c.boardId === id));
  return opened ? null : id;
}
