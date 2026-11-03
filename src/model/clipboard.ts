import { addArrow, arrowsAmong } from './arrows';
import { addCard as addCardAt, addColumn, columnOf, type Placement } from './board';
import { isPermanent, newId, type MakeId } from './cards';
import { freshCopies } from './checklist';
import type { Board, Card, Column } from './types';

/** How far each paste is offset from the copied blocks (and from the previous paste). */
const PASTE_OFFSET = 40;

/**
 * A copied block. Cards remember which column they came from so a copy can go back next to them.
 * An arrow between two copied blocks (job card-arrows) is copied too, by the blocks' old ids.
 */
export type ClipEntry =
  | { kind: 'card'; card: Card; columnId: string | null }
  | { kind: 'column'; column: Column; cards: Card[] }
  | { kind: 'arrow'; from: string; to: string };

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
      const cardIds = col.cardIds.filter((cid) => !isPermanent(board.cards[cid]));
      entries.push({ kind: 'column', column: { ...structuredClone(col), cardIds }, cards: cardIds.map((cid) => structuredClone(board.cards[cid])) });
      continue;
    }
    const card = board.cards[id];
    if (!card || isPermanent(card)) continue;
    const parent = columnOf(board, id);
    if (parent && selectedColumns.has(parent.id)) continue;
    // A card in a column has no position of its own: remember the column's, in case it is gone by the paste.
    const copy = parent ? { ...structuredClone(card), x: parent.x, y: parent.y } : structuredClone(card);
    entries.push({ kind: 'card', card: copy, columnId: parent?.id ?? null });
  }
  // Only arrows between blocks copied here (a container's cards count): never to one left behind.
  const copied = entries.flatMap((e) => (e.kind === 'card' ? [e.card.id] : e.kind === 'column' ? [e.column.id] : []));
  for (const a of arrowsAmong(board, copied)) entries.push({ kind: 'arrow', from: a.from, to: a.to });
  return entries;
}

function freshCard(card: Card, makeId: MakeId): Card {
  const copy = { ...structuredClone(card), id: makeId('k') };
  return copy.kind === 'todo' ? { ...copy, items: freshCopies(copy.items, makeId) } : copy;
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
  /** Each copied block's id → its copy's. */
  const copyOf = new Map<string, string>();
  for (const e of entries) {
    if (e.kind === 'arrow') {
      const from = copyOf.get(e.from);
      const to = copyOf.get(e.to);
      if (from && to) b = addArrow(b, from, to, makeId('a')) ?? b;
      continue;
    }
    if (e.kind === 'column') {
      const cards = e.cards.map((c) => freshCard(c, makeId));
      e.cards.forEach((c, i) => copyOf.set(c.id, cards[i].id));
      const col: Column = {
        ...structuredClone(e.column),
        id: makeId('c'),
        title: e.column.title ? `${e.column.title} copy` : '',
        x: e.column.x + off,
        y: e.column.y + off,
        cardIds: cards.map((c) => c.id),
      };
      copyOf.set(e.column.id, col.id);
      b = addColumn({ ...b, cards: { ...b.cards, ...Object.fromEntries(cards.map((c) => [c.id, c])) } }, col);
      ids.push(col.id);
      continue;
    }
    const card = freshCard(e.card, makeId);
    copyOf.set(e.card.id, card.id);
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
