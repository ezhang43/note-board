import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import { copyBlocks } from './clipboard';
import { cleanUp, completedCardOf, dayKey, dayLabel, hasTickedItems, restoreEntry } from './completed';
import { parseBoard, serializeBoard } from './persist';
import type { Board, CompletedCard, TodoCard, TodoItem } from './types';

const it_ = (id: string, done = false, children: TodoItem[] = []): TodoItem => ({ id, text: id, done, children });
const list = (id: string, title: string, items: TodoItem[]): TodoCard => ({ ...(createCard('todo', id) as TodoCard), title, items });
const outline = (items: TodoItem[]): string => items.map((i) => `${i.done ? '+' : ''}${i.id}${i.children.length ? `(${outline(i.children)})` : ''}`).join(' ');

let n = 0;
const makeId = (p: string) => `${p}${++n}`;
const here = { type: 'loose', x: 500, y: 0 } as const;

/** "Groceries" (loose): bread, +milk, fruit(apples, +pears(seeds)). "Chores" in a column: +sweep, dust. */
function board(): Board {
  let b = B.createBoard();
  b = B.addCard(b, list('g', 'Groceries', [it_('bread'), it_('milk', true), it_('fruit', false, [it_('apples'), it_('pears', true, [it_('seeds')])])]), {
    type: 'loose',
    x: 0,
    y: 0,
  });
  b = B.addColumn(b, { ...createColumn('col'), x: 0, y: 400 });
  b = B.addCard(b, list('c', 'Chores', [it_('sweep', true), it_('dust')]), { type: 'column', columnId: 'col', index: 0 });
  return b;
}
const items = (b: Board, id: string) => (b.cards[id] as TodoCard).items;
const done = (b: Board) => completedCardOf(b)!;
const entryIds = (c: CompletedCard) => c.groups.map((g) => `${g.date}: ${g.entries.map((e) => outline([e.item])).join(', ')}`);

describe('Clean up', () => {
  it('moves every ticked item (top level and sub-items, with what is under them) into a new Completed card', () => {
    const r = cleanUp(board(), '2026-10-02', here, makeId);
    expect(r.count).toBe(3);
    expect(outline(items(r.board, 'g'))).toBe('bread fruit(apples)');
    expect(outline(items(r.board, 'c'))).toBe('dust');
    expect(entryIds(done(r.board))).toEqual(['2026-10-02: +milk, +pears(seeds), +sweep']);
    expect(done(r.board)).toMatchObject({ x: 500, y: 0 });
    expect(r.board.order).toContain(r.cardId);
    expect(B.problems(r.board)).toEqual([]);
  });

  it('remembers where each item came from', () => {
    const entries = done(cleanUp(board(), '2026-10-02', here, makeId).board).groups[0].entries;
    expect(entries.map((e) => [e.fromCardId, e.fromTitle, e.fromParentId])).toEqual([
      ['g', 'Groceries', null],
      ['g', 'Groceries', 'fruit'],
      ['c', 'Chores', null],
    ]);
  });

  it('adds to the same day, and puts a new day on top', () => {
    let b = cleanUp(board(), '2026-10-01', here, makeId).board;
    b = C_tick(b, 'g', 'bread');
    b = cleanUp(b, '2026-10-01', here, makeId).board;
    b = C_tick(b, 'c', 'dust');
    b = cleanUp(b, '2026-10-03', here, makeId).board;
    expect(entryIds(done(b))).toEqual(['2026-10-03: +dust', '2026-10-01: +milk, +pears(seeds), +sweep, +bread']);
    expect(Object.values(b.cards).filter((c) => c.kind === 'completed')).toHaveLength(1);
  });

  it('a list left empty gets one blank item', () => {
    let b = B.addCard(B.createBoard(), list('x', 'X', [it_('only', true)]), { type: 'loose', x: 0, y: 0 });
    b = cleanUp(b, '2026-10-02', here, makeId).board;
    expect(items(b, 'x')).toHaveLength(1);
    expect(items(b, 'x')[0]).toMatchObject({ text: '', done: false });
  });

  it('does nothing when nothing is ticked', () => {
    const b = B.addCard(B.createBoard(), list('x', 'X', [it_('a')]), { type: 'loose', x: 0, y: 0 });
    expect(hasTickedItems(b)).toBe(false);
    expect(cleanUp(b, '2026-10-02', here, makeId)).toMatchObject({ board: b, count: 0 });
    expect(hasTickedItems(board())).toBe(true);
  });
});

/** Tick one item in a list. */
function C_tick(b: Board, cardId: string, itemId: string): Board {
  return B.toggleItemDone(b, cardId, itemId);
}

describe('unticking in the Completed card', () => {
  const cleaned = () => cleanUp(board(), '2026-10-02', here, makeId).board;

  it('sends a top-level item back, unticked, to the end of its list', () => {
    const r = restoreEntry(cleaned(), 'milk', here, makeId);
    expect(r.cardId).toBe('g');
    expect(outline(items(r.board, 'g'))).toBe('bread fruit(apples) milk');
    expect(entryIds(done(r.board))).toEqual(['2026-10-02: +pears(seeds), +sweep']);
  });

  it('sends a sub-item back under the item it was in', () => {
    const r = restoreEntry(cleaned(), 'pears', here, makeId);
    expect(outline(items(r.board, 'g'))).toBe('bread fruit(apples pears(seeds))');
  });

  it('goes to the end of the list when the item it was in is gone', () => {
    let b = cleaned();
    b = B.updateCard(b, 'g', (c) => ({ ...(c as TodoCard), items: [it_('bread')] }));
    b = restoreEntry(b, 'pears', here, makeId).board;
    expect(outline(items(b, 'g'))).toBe('bread pears(seeds)');
  });

  it('makes a new list with the old title when its list is gone', () => {
    let b = B.deleteCard(cleaned(), 'g');
    const r = restoreEntry(b, 'milk', here, makeId);
    b = r.board;
    expect(r.cardId).not.toBe('g');
    expect(b.cards[r.cardId!]).toMatchObject({ kind: 'todo', title: 'Groceries', x: 500, y: 0 });
    expect(outline(items(b, r.cardId!))).toBe('milk');
  });

  it('removes a day once its last item has gone back', () => {
    let b = cleaned();
    for (const id of ['milk', 'pears', 'sweep']) b = restoreEntry(b, id, here, makeId).board;
    expect(done(b).groups).toEqual([]);
    expect(done(b)).toBeDefined(); // the card itself stays
  });
});

describe('the Completed card is never deleted or copied', () => {
  it('ignores delete, and survives deleting its column (left loose where the column was)', () => {
    let b = cleanUp(board(), '2026-10-02', here, makeId).board;
    const id = done(b).id;
    expect(B.deleteCard(b, id)).toBe(b);
    expect(B.deleteBlocks(b, [id, 'g']).cards[id]).toBeDefined();
    b = B.moveCard(b, id, { type: 'column', columnId: 'col', index: 1 });
    b = B.deleteColumn(b, 'col');
    expect(b.cards[id]).toMatchObject({ x: 0, y: 400 });
    expect(b.cards.c).toBeUndefined();
    expect(B.problems(b)).toEqual([]);
  });

  it('is left out of copies', () => {
    let b = cleanUp(board(), '2026-10-02', here, makeId).board;
    const id = done(b).id;
    expect(copyBlocks(b, [id])).toEqual([]);
    b = B.moveCard(b, id, { type: 'column', columnId: 'col', index: 1 });
    const [col] = copyBlocks(b, ['col']);
    expect(col.kind === 'column' && col.cards.map((c) => c.id)).toEqual(['c']);
  });

  it('is saved and loaded', () => {
    const b = cleanUp(board(), '2026-10-02', here, makeId).board;
    expect(parseBoard(serializeBoard(b))).toEqual(b);
  });
});

describe('days', () => {
  it('formats the day of a date', () => {
    expect(dayKey(new Date(2026, 9, 2, 23, 59))).toBe('2026-10-02');
    expect(dayLabel('2026-10-02')).toBe('2 Oct 2026');
  });
});
