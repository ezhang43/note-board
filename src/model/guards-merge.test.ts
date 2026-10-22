import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import { mergeBoards } from './merge';
import { readBoard, serializeBoard } from './persist';
import type { Board, Card, CompletedCard, NoteCard, TodoCard, TodoItem } from './types';

// The merge fuzz test in merge.test.ts only adds, moves and recolors. This one also deletes list items,
// changes note text and adds Completed groups, and checks that what the merge gives still reloads the
// same after being saved (a merged board is saved and uploaded at once).
// A single edit never empties a list here: an empty list reloads with one blank item (review item M7).

const item = (id: string, children: TodoItem[] = []): TodoItem => ({ id, text: id, done: false, children });
const note = (id: string): NoteCard => ({ ...(createCard('note', id) as NoteCard), text: id });
const list = (id: string, items: TodoItem[]): TodoCard => ({ ...(createCard('todo', id) as TodoCard), title: id, items });

function sample(): Board {
  let b = B.createBoard();
  b = B.addColumn(b, { ...createColumn('c1'), title: 'Col' });
  b = B.addCard(b, note('n1'), { type: 'loose', x: 0, y: 0 });
  b = B.addCard(b, note('n2'), { type: 'column', columnId: 'c1', index: 0 });
  b = B.addCard(b, list('t1', [item('a', [item('a1'), item('a2')]), item('b'), item('c')]), { type: 'loose', x: 300, y: 0 });
  return b;
}

function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}

const flat = (xs: TodoItem[]): string[] => xs.flatMap((x) => [x.id, ...flat(x.children)]);
const allItems = (b: Board) => Object.values(b.cards).flatMap((c) => (c.kind === 'todo' ? flat(c.items) : []));

/** Removes item `id` (with its children) from a list of items, however deep. */
function without(xs: TodoItem[], id: string): TodoItem[] {
  return xs.filter((x) => x.id !== id).map((x) => ({ ...x, children: without(x.children, id) }));
}

function randomEdit(b: Board, r: () => number, tag: string): Board {
  const cardIds = Object.keys(b.cards);
  const colIds = Object.keys(b.columns);
  const anyCard = () => cardIds[Math.floor(r() * cardIds.length)];
  const anyCol = () => colIds[Math.floor(r() * colIds.length)];
  const id = `${tag}${Math.floor(r() * 1e6)}`;
  const lists = cardIds.filter((c) => b.cards[c].kind === 'todo');
  const notes = cardIds.filter((c) => b.cards[c].kind === 'note');
  switch (Math.floor(r() * 12)) {
    case 0:
      return B.addCard(b, note(id), { type: 'loose', x: 0, y: 0 });
    case 1:
      return colIds.length ? B.addCard(b, note(id), { type: 'column', columnId: anyCol(), index: 0 }) : b;
    case 2:
      return B.addColumn(b, createColumn(id));
    case 3:
      return cardIds.length ? B.deleteCard(b, anyCard()) : b;
    case 4:
      return colIds.length ? B.deleteColumn(b, anyCol()) : b;
    case 5:
      return cardIds.length && colIds.length ? B.moveCard(b, anyCard(), { type: 'column', columnId: anyCol(), index: 0 }) : b;
    case 6:
      return cardIds.length ? B.moveCard(b, anyCard(), { type: 'loose', x: 10, y: 10 }) : b;
    case 7: {
      if (!lists.length) return B.addCard(b, list(id, [item(`${id}a`)]), { type: 'loose', x: 0, y: 0 });
      const c = lists[Math.floor(r() * lists.length)];
      const xs = (b.cards[c] as TodoCard).items;
      return B.updateCard(b, c, (card) => ({ ...card, items: [...xs, item(id)] }) as Card);
    }
    case 8: {
      // Delete an item (any depth), but never the last one left.
      if (!lists.length) return b;
      const c = lists[Math.floor(r() * lists.length)];
      const xs = (b.cards[c] as TodoCard).items;
      const ids = flat(xs);
      const gone = ids[Math.floor(r() * ids.length)];
      const next = without(xs, gone);
      return next.length ? B.updateCard(b, c, (card) => ({ ...card, items: next }) as Card) : b;
    }
    case 9:
      return notes.length ? B.updateCard(b, notes[Math.floor(r() * notes.length)], (card) => ({ ...card, text: `${tag} ${id}` }) as Card) : b;
    case 10: {
      // A new day's group on the board's one Completed card (made if it isn't there yet).
      const group = { date: `2026-10-${10 + Math.floor(r() * 10)}`, entries: [{ item: item(id), fromCardId: 't1', fromTitle: 'List', fromParentId: null }] };
      const done = b.cards.done as CompletedCard | undefined;
      if (!done) return B.addCard(b, { id: 'done', kind: 'completed', color: 'butter', collapsed: false, x: 0, y: 0, w: null, h: null, groups: [group] }, { type: 'loose', x: 700, y: 0 });
      return B.updateCard(b, 'done', (card) => ({ ...card, groups: [group, ...(card as CompletedCard).groups] }) as Card);
    }
    default:
      return cardIds.length ? B.updateCard(b, anyCard(), (card) => ({ ...card, color: tag === 'm' ? 'rose' : 'sky' })) : b;
  }
}

describe('random edits on both sides, with item deletes, text changes and Completed groups (G22)', () => {
  it('always gives a healthy board with no item in two places, that reloads exactly as saved', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      let base = sample();
      for (let i = 0; i < 4; i++) base = randomEdit(base, r, 'b');
      let mine = base;
      let theirs = base;
      for (let i = 0; i < 4; i++) mine = randomEdit(mine, r, 'm');
      for (let i = 0; i < 4; i++) theirs = randomEdit(theirs, r, 't');
      const merged = mergeBoards(base, mine, theirs);
      expect(B.problems(merged), `seed ${seed}`).toEqual([]);
      const ids = allItems(merged);
      expect(new Set(ids).size, `seed ${seed}: an item in two places`).toBe(ids.length);
      // Two sides each deleting some of a list's items can leave it empty, and an empty list reloads with
      // one blank item (review item M7, known). Those boards are left out of the reload check.
      if (Object.values(merged.cards).some((c) => c.kind === 'todo' && !c.items.length)) continue;
      const saved = serializeBoard(merged);
      // Compared as data: the order of a card's fields in the text doesn't matter.
      expect(JSON.parse(serializeBoard(readBoard(saved)!)), `seed ${seed}: changed by save and load`).toEqual(JSON.parse(saved));
    }
  });

  it('agrees with either side when the other did nothing, and combining again changes nothing', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      let base = sample();
      for (let i = 0; i < 4; i++) base = randomEdit(base, r, 'b');
      let mine = base;
      let theirs = base;
      for (let i = 0; i < 3; i++) mine = randomEdit(mine, r, 'm');
      for (let i = 0; i < 3; i++) theirs = randomEdit(theirs, r, 't');
      const merged = mergeBoards(base, mine, theirs);
      expect(mergeBoards(base, base, theirs), `seed ${seed}`).toEqual(theirs);
      expect(mergeBoards(base, mine, base), `seed ${seed}`).toEqual(mine);
      expect(mergeBoards(theirs, merged, theirs), `seed ${seed}`).toEqual(merged);
    }
  });
});
