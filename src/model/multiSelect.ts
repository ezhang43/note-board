import { newId, type MakeId } from './cards';
import { deleteItems, displayOrder, editItems, findItem, flatIds, sections, setItemsDone } from './checklist';
import type { Board, TodoCard } from './types';

// Checklist items selected in several lists at once (owner request): by Ctrl+A pressed again and
// again (the lists in the same column, then the whole board), or by press-and-drag from one card
// into the next ones in the same column. Copy, Delete and ticking work on all of them.

/** Selected items in one list, in the order shown. */
export interface ListSelection {
  cardId: string;
  ids: string[];
}

/** The items of a list you can see: none if the card is collapsed; not the Completed section while it is closed. */
export function visibleItems(card: TodoCard): string[] {
  if (card.collapsed) return [];
  return card.completedOpen ? displayOrder(card.items) : flatIds(sections(card.items).open);
}

function listsOf(board: Board, cardIds: string[]): ListSelection[] {
  return cardIds.flatMap((id) => {
    const card = board.cards[id];
    if (card?.kind !== 'todo') return [];
    const ids = visibleItems(card);
    return ids.length ? [{ cardId: id, ids }] : [];
  });
}

/** Ctrl+A step 3: every visible item in every list in this column (none while it is collapsed). */
export function columnLists(board: Board, columnId: string): ListSelection[] {
  const col = board.columns[columnId];
  return col && !col.collapsed ? listsOf(board, col.cardIds) : [];
}

/** Ctrl+A step 4: every visible item on the board: columns left to right, then loose lists top to bottom. */
export function boardLists(board: Board): ListSelection[] {
  const byPlace = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x - b.x || a.y - b.y;
  const columns = board.order.filter((id) => board.columns[id]).sort((a, b) => byPlace(board.columns[a], board.columns[b]));
  const loose = board.order
    .filter((id) => board.cards[id]?.kind === 'todo')
    .sort((a, b) => board.cards[a].y - board.cards[b].y || board.cards[a].x - board.cards[b].x);
  return [...columns.flatMap((id) => columnLists(board, id)), ...listsOf(board, loose)];
}

/** Press-and-drag from item `a` to item `b` in lists of the same column: everything shown between them. */
export function rangeAcross(
  board: Board,
  columnId: string,
  a: { cardId: string; itemId: string },
  b: { cardId: string; itemId: string },
): ListSelection[] {
  const flat = columnLists(board, columnId).flatMap((l) => l.ids.map((itemId) => ({ cardId: l.cardId, itemId })));
  const at = (p: { cardId: string; itemId: string }) => flat.findIndex((f) => f.cardId === p.cardId && f.itemId === p.itemId);
  const i = at(a);
  const j = at(b);
  if (i === -1 || j === -1) return [];
  const picked = flat.slice(Math.min(i, j), Math.max(i, j) + 1);
  const lists: ListSelection[] = [];
  for (const p of picked) {
    const last = lists[lists.length - 1];
    if (last?.cardId === p.cardId) last.ids.push(p.itemId);
    else lists.push({ cardId: p.cardId, ids: [p.itemId] });
  }
  return lists;
}

/** Plain text to copy: each list's title on its own line, its selected items indented under it. */
export function multiAsText(board: Board, lists: ListSelection[]): string {
  return lists
    .flatMap(({ cardId, ids }) => {
      const card = board.cards[cardId];
      if (card?.kind !== 'todo') return [];
      const rows = ids.map((id) => findItem(card.items, id)).filter((r) => r !== null);
      const top = Math.min(...rows.map((r) => r.depth));
      return [card.title || 'Untitled list', ...rows.map((r) => '  '.repeat(r.depth - top + 1) + r.item.text)];
    })
    .join('\n');
}

/** Delete: the selected items (and what is under them) go from every list; an emptied list keeps one blank item. */
export function deleteAcross(board: Board, lists: ListSelection[], makeId: MakeId = newId): Board {
  return lists.reduce((b, l) => editItems(b, l.cardId, (items) => deleteItems(items, l.ids, makeId)), board);
}

/** Ticking one of them ticks (or unticks) the selected items in every list. */
export function setDoneAcross(board: Board, lists: ListSelection[], done: boolean): Board {
  return lists.reduce((b, l) => editItems(b, l.cardId, (items) => setItemsDone(items, l.ids, done)), board);
}
