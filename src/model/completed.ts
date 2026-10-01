import { addCard, type Placement } from './board';
import { createItem, newId } from './cards';
import { MAX_DEPTH, editItems, findItem, subtreeHeight } from './checklist';
import type { Board, Card, CompletedCard, CompletedEntry, TodoItem } from './types';

// Clean up (owner request): every ticked checklist item moves into the board's one master
// Completed card, grouped by the day Clean up was clicked. The Completed card is never deleted.
// Unticking an item there sends it back to the list it came from.

type MakeId = (prefix: string) => string;

/** The day as "YYYY-MM-DD", in local time. */
export function dayKey(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** "2 Oct 2026" for a "YYYY-MM-DD" day. */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function completedCardOf(board: Board): CompletedCard | null {
  return (Object.values(board.cards).find((c) => c.kind === 'completed') as CompletedCard | undefined) ?? null;
}

/** To-do lists in the order they appear: loose ones and columns back to front, cards in a column top to bottom. */
function listsInOrder(board: Board): string[] {
  return board.order.flatMap((id) => (board.columns[id] ? board.columns[id].cardIds : [id])).filter((id) => board.cards[id]?.kind === 'todo');
}

/** True if any to-do list has a ticked item (at any level), so Clean up has something to do. */
export function hasTickedItems(board: Board): boolean {
  const any = (items: TodoItem[]): boolean => items.some((it) => it.done || any(it.children));
  return listsInOrder(board).some((id) => {
    const c = board.cards[id];
    return c.kind === 'todo' && any(c.items);
  });
}

/**
 * Takes every ticked item out of a list: ticked top-level items (the Completed section) and ticked
 * sub-items under open items, each with everything under it. Returns what is left and what was taken.
 */
function takeTicked(items: TodoItem[], parentId: string | null): { rest: TodoItem[]; taken: { item: TodoItem; parentId: string | null }[] } {
  const rest: TodoItem[] = [];
  const taken: { item: TodoItem; parentId: string | null }[] = [];
  for (const it of items) {
    if (it.done) {
      taken.push({ item: it, parentId });
      continue;
    }
    const inner = takeTicked(it.children, it.id);
    rest.push(inner.taken.length ? { ...it, children: inner.rest } : it);
    taken.push(...inner.taken);
  }
  return { rest, taken };
}

/**
 * Clean up: moves every ticked item into the Completed card, under the group for `day` (newest
 * group first; a second Clean up on the same day adds to that day's group). Makes the Completed card
 * at `place` if the board doesn't have one yet. Lists left empty get one blank item.
 * Returns the same board (and count 0) when nothing is ticked.
 */
export function cleanUp(board: Board, day: string, place: Placement, makeId: MakeId = newId): { board: Board; count: number; cardId: string | null } {
  const entries: CompletedEntry[] = [];
  let b = board;
  for (const id of listsInOrder(board)) {
    const card = board.cards[id];
    if (card.kind !== 'todo') continue;
    const { rest, taken } = takeTicked(card.items, null);
    if (!taken.length) continue;
    for (const t of taken) entries.push({ item: t.item, fromCardId: id, fromTitle: card.title, fromParentId: t.parentId });
    b = editItems(b, id, () => (rest.length ? rest : [createItem(makeId('i'))]));
  }
  if (!entries.length) return { board, count: 0, cardId: completedCardOf(board)?.id ?? null };

  let done = completedCardOf(b);
  if (!done) {
    const card: CompletedCard = { id: makeId('k'), kind: 'completed', color: 'stone', collapsed: false, x: 0, y: 0, w: null, h: null, groups: [] };
    b = addCard(b, card, place);
    done = card;
  }
  const groups = done.groups.some((g) => g.date === day)
    ? done.groups.map((g) => (g.date === day ? { ...g, entries: [...g.entries, ...entries] } : g))
    : [{ date: day, entries }, ...done.groups];
  const doneId = done.id;
  b = { ...b, cards: { ...b.cards, [doneId]: { ...(b.cards[doneId] as CompletedCard), groups } } };
  return { board: b, count: entries.length, cardId: doneId };
}

/**
 * Unticking an item in the Completed card: it goes back, unticked, to the list it came from (under
 * the item it was nested in, if that is still there and the 6-level limit allows; otherwise at the
 * end of the list). If that list is gone, a new list with its old title is made at `place`.
 * Its sub-items keep their ticks. Returns the board and the list it went to.
 */
export function restoreEntry(board: Board, itemId: string, place: Placement, makeId: MakeId = newId): { board: Board; cardId: string | null } {
  const done = completedCardOf(board);
  const entry = done?.groups.flatMap((g) => g.entries).find((e) => e.item.id === itemId);
  if (!done || !entry) return { board, cardId: null };
  const groups = done.groups
    .map((g) => ({ ...g, entries: g.entries.filter((e) => e !== entry) }))
    .filter((g) => g.entries.length);
  let b: Board = { ...board, cards: { ...board.cards, [done.id]: { ...done, groups } } };
  const item: TodoItem = { ...structuredClone(entry.item), done: false };

  const src = b.cards[entry.fromCardId];
  if (src?.kind === 'todo') {
    b = editItems(b, src.id, (items) => {
      const next = structuredClone(items);
      const parent = entry.fromParentId ? findItem(next, entry.fromParentId) : null;
      if (parent && parent.depth + 1 + subtreeHeight(item) <= MAX_DEPTH) parent.item.children.push(item);
      else next.push(item);
      return next;
    });
    return { board: b, cardId: src.id };
  }
  const card: Card = {
    id: makeId('k'),
    kind: 'todo',
    color: 'mint',
    collapsed: false,
    x: 0,
    y: 0,
    w: null,
    h: null,
    title: entry.fromTitle,
    items: [item],
    completedOpen: true,
  };
  return { board: addCard(b, card, place), cardId: card.id };
}
