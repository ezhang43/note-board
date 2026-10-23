import { addCard, type Placement } from './board';
import { newId, type MakeId } from './cards';
import { MAX_DEPTH, editItems, findItem, hasTicked, refill, setItemsDone, subtreeHeight, subtreeIds } from './checklist';
import type { Board, Card, CompletedCard, CompletedEntry, CompletedGroup, TodoItem } from './types';

// Clean up (owner request): every ticked checklist item moves into the board's one master
// Completed card, grouped by the day Clean up was clicked. The Completed card is never deleted.
// Unticking an item there sends it back to the list it came from.


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

const isRecord = (c: Card): c is CompletedCard => c.kind === 'completed';

/** The days of several records as one list: entries of the same day together, newest day first. */
function mergeDays(records: CompletedCard[]): CompletedGroup[] {
  const days = new Map<string, CompletedEntry[]>();
  for (const g of records.flatMap((r) => r.groups)) days.set(g.date, [...(days.get(g.date) ?? []), ...g.entries]);
  return [...days].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)).map(([date, entries]) => ({ date, entries }));
}

const viewOf = new WeakMap<Board, CompletedCard | null>();

/**
 * The board's Completed record. A shared board can end up with two (each device made its own at its
 * first Clean up, job 183): then this is the first one (lowest id) with every record's days in it, so
 * nothing is hidden. The same board always gives the same object.
 */
export function completedCardOf(board: Board): CompletedCard | null {
  if (viewOf.has(board)) return viewOf.get(board)!;
  const all = Object.values(board.cards).filter(isRecord).sort((a, b) => (a.id < b.id ? -1 : 1));
  const view = all.length > 1 ? { ...all[0], groups: mergeDays(all) } : (all[0] ?? null);
  viewOf.set(board, view);
  return view;
}

/** `place`, or a loose spot when it names a column that is gone (the card is never left in no place). */
const placeOrLoose = (board: Board, place: Placement): Placement => (place.type === 'column' && !board.columns[place.columnId] ? { type: 'loose', x: 0, y: 0 } : place);

/** Folds a second Completed record into the first, so Clean up and restore have just one to change. */
function oneRecord(board: Board): Board {
  const view = completedCardOf(board);
  const extra = Object.values(board.cards).filter((c) => isRecord(c) && c.id !== view?.id).map((c) => c.id);
  if (!view || !extra.length) return board;
  const cards = { ...board.cards, [view.id]: view };
  for (const id of extra) delete cards[id];
  const columns = Object.fromEntries(Object.entries(board.columns).map(([id, c]) => [id, { ...c, cardIds: c.cardIds.filter((k) => !extra.includes(k)) }]));
  return { ...board, cards, columns, order: board.order.filter((id) => !extra.includes(id)) };
}

/** To-do lists in the order they appear: loose ones and columns back to front, cards in a column top to bottom. */
function listsInOrder(board: Board): string[] {
  return board.order.flatMap((id) => (board.columns[id] ? board.columns[id].cardIds : [id])).filter((id) => board.cards[id]?.kind === 'todo');
}

/** True if any to-do list has a ticked item (at any level), so Clean up has something to do. */
export function hasTickedItems(board: Board): boolean {
  return listsInOrder(board).some((id) => {
    const c = board.cards[id];
    return c.kind === 'todo' && hasTicked(c.items);
  });
}

/** How many ticked items the board's lists hold, with everything nested under them. */
export function tickedCount(board: Board): number {
  return listsInOrder(board).reduce((n, id) => {
    const c = board.cards[id];
    return n + (c.kind === 'todo' ? takeTicked(c.items, null).taken.flatMap((t) => subtreeIds(t.item)).length : 0);
  }, 0);
}

/**
 * Delete completed items (Ctrl+Shift+Backspace): every list on the board loses its ticked items, with
 * what is nested under them (owner request, 2026-10-23, job 200: there is no Completed section any
 * more). The Completed card is left alone. Lists left empty get one blank item. Returns the same
 * board when there is nothing to delete.
 */
export function deleteTicked(board: Board, makeId: MakeId = newId): Board {
  let b = board;
  for (const id of listsInOrder(board)) {
    const card = board.cards[id];
    if (card.kind !== 'todo') continue;
    const { rest, taken } = takeTicked(card.items, null);
    if (taken.length) b = editItems(b, id, () => refill(rest, makeId));
  }
  return b;
}

/**
 * Takes every ticked item out of a list: ticked top-level items and ticked
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
 * With `onlyCardId`, only that list is cleaned up (the Clean up button in its title row).
 * Returns the same board (and count 0) when nothing is ticked.
 */
export function cleanUp(
  board: Board,
  day: string,
  place: Placement,
  makeId: MakeId = newId,
  onlyCardId?: string,
): { board: Board; count: number; cardId: string | null } {
  const entries: CompletedEntry[] = [];
  let b = oneRecord(board);
  for (const id of onlyCardId ? [onlyCardId] : listsInOrder(board)) {
    const card = board.cards[id];
    if (card?.kind !== 'todo') continue;
    const { rest, taken } = takeTicked(card.items, null);
    if (!taken.length) continue;
    for (const t of taken) entries.push({ item: t.item, fromCardId: id, fromTitle: card.title, fromParentId: t.parentId });
    b = editItems(b, id, () => refill(rest, makeId));
  }
  if (!entries.length) return { board, count: 0, cardId: completedCardOf(board)?.id ?? null };

  let done = completedCardOf(b);
  if (!done) {
    const card: CompletedCard = { id: makeId('k'), kind: 'completed', color: 'stone', collapsed: false, x: 0, y: 0, w: null, h: null, groups: [] };
    b = addCard(b, card, placeOrLoose(b, place));
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
  const folded = oneRecord(board);
  const done = completedCardOf(folded);
  const entry = done?.groups.flatMap((g) => g.entries).find((e) => e.item.id === itemId);
  if (!done || !entry) return { board, cardId: null };
  const groups = done.groups
    .map((g) => ({ ...g, entries: g.entries.filter((e) => e !== entry) }))
    .filter((g) => g.entries.length);
  let b: Board = { ...folded, cards: { ...folded.cards, [done.id]: { ...done, groups } } };
  const item: TodoItem = { ...structuredClone(entry.item), done: false };

  const src = b.cards[entry.fromCardId];
  if (src?.kind === 'todo') {
    b = editItems(b, src.id, (items) => {
      const next = structuredClone(items);
      const parent = entry.fromParentId ? findItem(next, entry.fromParentId) : null;
      if (parent && parent.depth + 1 + subtreeHeight(item) <= MAX_DEPTH) parent.item.children.push(item);
      else return [...next, item];
      // An open item can't sit under a ticked one: untick the items it went back under.
      return setItemsDone(next, [item.id], false);
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
  return { board: addCard(b, card, placeOrLoose(b, place)), cardId: card.id };
}
