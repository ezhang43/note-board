import { addCard as addCardAt, addColumn, columnOf, type Placement } from './board';
import { newId } from './cards';
import type { Board, Card, Column, TodoItem } from './types';

/** How far each paste is offset from the copied blocks (and from the previous paste). */
export const PASTE_OFFSET = 40;

/** A copied block. Cards remember which column they came from so a copy can go back next to them. */
export type ClipEntry =
  | { kind: 'card'; card: Card; columnId: string | null }
  | { kind: 'column'; column: Column; cards: Card[] };

/**
 * Copies the selected blocks. A column copies with its cards; a card whose column is also
 * selected is already included with the column.
 */
export function copyBlocks(board: Board, ids: string[]): ClipEntry[] {
  const selectedColumns = new Set(ids.filter((id) => board.columns[id]));
  const entries: ClipEntry[] = [];
  for (const id of ids) {
    // The Completed card is one of a kind: it is never copied.
    const col = board.columns[id];
    if (col) {
      const cardIds = col.cardIds.filter((cid) => board.cards[cid].kind !== 'completed');
      entries.push({ kind: 'column', column: { ...structuredClone(col), cardIds }, cards: cardIds.map((cid) => structuredClone(board.cards[cid])) });
      continue;
    }
    const card = board.cards[id];
    if (!card || card.kind === 'completed') continue;
    const parent = columnOf(board, id);
    if (parent && selectedColumns.has(parent.id)) continue;
    entries.push({ kind: 'card', card: structuredClone(card), columnId: parent?.id ?? null });
  }
  return entries;
}

function freshItems(items: TodoItem[], makeId: (p: string) => string): TodoItem[] {
  return items.map((it) => ({ ...it, id: makeId('i'), children: freshItems(it.children, makeId) }));
}

function freshCard(card: Card, makeId: (p: string) => string): Card {
  const copy = { ...structuredClone(card), id: makeId('k') };
  return copy.kind === 'todo' ? { ...copy, items: freshItems(copy.items, makeId) } : copy;
}

/**
 * Pastes copied blocks as brand-new blocks. `times` is how many times this clipboard has been
 * pasted (1 for the first paste), so each paste lands a further 40px down and right.
 * A copied card from a column that still exists goes back into that column, right below the original.
 * Returns the new board and the ids of the new blocks.
 */
export function pasteBlocks(
  board: Board,
  entries: ClipEntry[],
  times: number,
  makeId: (prefix: string) => string = newId,
): { board: Board; ids: string[] } {
  const off = PASTE_OFFSET * times;
  const ids: string[] = [];
  let b = board;
  for (const e of entries) {
    if (e.kind === 'column') {
      const cards = e.cards.map((c) => freshCard(c, makeId));
      const col: Column = {
        ...structuredClone(e.column),
        id: makeId('c'),
        title: e.column.title ? `${e.column.title} copy` : '',
        x: e.column.x + off,
        y: e.column.y + off,
        cardIds: cards.map((c) => c.id),
      };
      b = addColumn({ ...b, cards: { ...b.cards, ...Object.fromEntries(cards.map((c) => [c.id, c])) } }, col);
      ids.push(col.id);
      continue;
    }
    const card = freshCard(e.card, makeId);
    const col = e.columnId ? b.columns[e.columnId] : undefined;
    let place: Placement;
    if (col) {
      const at = col.cardIds.indexOf(e.card.id);
      place = { type: 'column', columnId: col.id, index: at === -1 ? col.cardIds.length : at + 1 };
    } else {
      place = { type: 'loose', x: e.card.x + off, y: e.card.y + off };
    }
    b = addCardAt(b, card, place);
    ids.push(card.id);
  }
  return { board: b, ids };
}
