import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createBoardCard, createCard, createColumn } from './cards';
import { mergeBoards, mergeBoardSets } from './merge';
import type { Board, Card, NoteCard, TodoCard, TodoItem } from './types';

// Combining two people's edits (real-time collaboration): base = the board both started from,
// mine = this page's board, theirs = the board someone else saved. Edits to different things are
// all kept; when both changed the very same thing, mine (the later one) wins.

const item = (id: string, children: TodoItem[] = [], text = id): TodoItem => ({ id, text, done: false, children });
const note = (id: string, text = id): NoteCard => ({ ...(createCard('note', id) as NoteCard), text });
const list = (id: string, items: TodoItem[]): TodoCard => ({ ...(createCard('todo', id) as TodoCard), title: id, items });

function sample(): Board {
  let b = B.createBoard();
  b = B.addColumn(b, { ...createColumn('c1'), title: 'Col' });
  b = B.addCard(b, note('n1'), { type: 'loose', x: 0, y: 0 });
  b = B.addCard(b, note('n2'), { type: 'column', columnId: 'c1', index: 0 });
  b = B.addCard(b, list('t1', [item('a', [item('a1'), item('a2')]), item('b')]), { type: 'loose', x: 300, y: 0 });
  return b;
}

const text = (b: Board, id: string) => (b.cards[id] as NoteCard).text;
const items = (b: Board, id: string) => (b.cards[id] as TodoCard).items;
const shape = (xs: TodoItem[]): string => xs.map((i) => (i.children.length ? `${i.id}(${shape(i.children)})` : i.id)).join(' ');
const setText = (b: Board, id: string, t: string) => B.updateCard(b, id, (c) => ({ ...c, text: t }) as Card);
const setItems = (b: Board, id: string, xs: TodoItem[]) => B.updateCard(b, id, (c) => ({ ...c, items: xs }) as Card);

describe('nothing to combine', () => {
  it('only they changed: their board, exactly', () => {
    const base = sample();
    const theirs = setText(B.renameBoard(base, 'Trip'), 'n1', 'hello');
    expect(mergeBoards(base, base, theirs)).toEqual(theirs);
  });

  it('only I changed: my board, exactly', () => {
    const base = sample();
    const mine = B.moveCard(setText(base, 'n2', 'mine'), 'n1', { type: 'column', columnId: 'c1', index: 1 });
    expect(mergeBoards(base, mine, base)).toEqual(mine);
  });
});

describe('edits to different things are all kept', () => {
  it('two different cards', () => {
    const base = sample();
    const merged = mergeBoards(base, setText(base, 'n1', 'mine'), setText(base, 'n2', 'theirs'));
    expect(text(merged, 'n1')).toBe('mine');
    expect(text(merged, 'n2')).toBe('theirs');
    expect(B.problems(merged)).toEqual([]);
  });

  it('two different fields of one card (text and position)', () => {
    const base = sample();
    const mine = setText(base, 'n1', 'mine');
    const theirs = B.updateCard(base, 'n1', (c) => ({ ...c, x: 500, y: 200 }));
    const merged = mergeBoards(base, mine, theirs);
    expect(merged.cards.n1).toMatchObject({ text: 'mine', x: 500, y: 200 });
  });

  it('cards both added stay, each where it was put', () => {
    const base = sample();
    const mine = B.addCard(base, note('m'), { type: 'column', columnId: 'c1', index: 1 });
    const theirs = B.addCard(base, note('t'), { type: 'loose', x: 900, y: 0 });
    const merged = mergeBoards(base, mine, theirs);
    expect(merged.columns.c1.cardIds).toEqual(['n2', 'm']);
    expect(merged.order).toContain('t');
    expect(B.problems(merged)).toEqual([]);
  });

  it('both add a card to the same column: both are in it', () => {
    const base = sample();
    const mine = B.addCard(base, note('m'), { type: 'column', columnId: 'c1', index: 1 });
    const theirs = B.addCard(base, note('t'), { type: 'column', columnId: 'c1', index: 1 });
    const merged = mergeBoards(base, mine, theirs);
    expect([...merged.columns.c1.cardIds].sort()).toEqual(['m', 'n2', 't']);
    expect(merged.columns.c1.cardIds[0]).toBe('n2');
    expect(B.problems(merged)).toEqual([]);
  });

  it('a card I move into a column keeps the text they typed meanwhile', () => {
    const base = sample();
    const mine = B.moveCard(base, 'n1', { type: 'column', columnId: 'c1', index: 0 });
    const theirs = setText(base, 'n1', 'typed');
    const merged = mergeBoards(base, mine, theirs);
    expect(merged.columns.c1.cardIds).toEqual(['n1', 'n2']);
    expect(text(merged, 'n1')).toBe('typed');
    expect(B.problems(merged)).toEqual([]);
  });

  it('a card moved by both ends up in one place only: where I put it', () => {
    const base = sample();
    const mine = B.moveCard(base, 'n1', { type: 'column', columnId: 'c1', index: 0 });
    const theirs = B.moveCard(base, 'n1', { type: 'loose', x: 700, y: 700 });
    const merged = mergeBoards(base, mine, theirs);
    expect(merged.columns.c1.cardIds).toContain('n1');
    expect(B.problems(merged)).toEqual([]);
  });

  it('board name from one, snap setting from the other', () => {
    const base = sample();
    const merged = mergeBoards(base, B.renameBoard(base, 'Mine'), B.setSnap(base, false));
    expect(merged.name).toBe('Mine');
    expect(merged.snap).toBe(false);
  });

  it('arrows both drew are kept', () => {
    const base = sample();
    const mine = { ...base, arrows: [{ id: 'r1', from: 'n1', to: 'c1' }] };
    const theirs = { ...base, arrows: [{ id: 'r2', from: 't1', to: 'n1' }] };
    expect(mergeBoards(base, mine, theirs).arrows?.map((a) => a.id).sort()).toEqual(['r1', 'r2']);
  });
});

describe('checklist items', () => {
  it('ticking one item and typing in another', () => {
    const base = sample();
    const mine = setItems(base, 't1', [item('a', [item('a1'), item('a2')]), { ...item('b'), done: true }]);
    const theirs = setItems(base, 't1', [item('a', [item('a1', [], 'typed'), item('a2')]), item('b')]);
    const merged = items(mergeBoards(base, mine, theirs), 't1');
    expect(merged[1].done).toBe(true);
    expect(merged[0].children[0].text).toBe('typed');
  });

  it('items both added to one list are all kept, in place', () => {
    const base = sample();
    const mine = setItems(base, 't1', [item('a', [item('a1'), item('a2')]), item('m'), item('b')]);
    const theirs = setItems(base, 't1', [item('a', [item('a1'), item('a2'), item('t')]), item('b')]);
    expect(shape(items(mergeBoards(base, mine, theirs), 't1'))).toBe('a(a1 a2 t) m b');
  });

  it('an item I indent keeps the text they typed in it', () => {
    const base = sample();
    const mine = setItems(base, 't1', [item('a', [item('a1'), item('a2'), item('b')])]);
    const theirs = setItems(base, 't1', [item('a', [item('a1'), item('a2')]), item('b', [], 'typed')]);
    const merged = items(mergeBoards(base, mine, theirs), 't1');
    expect(shape(merged)).toBe('a(a1 a2 b)');
    expect(merged[0].children[2].text).toBe('typed');
  });

  it('an item dragged to another list is in that list only', () => {
    let base = sample();
    base = B.addCard(base, list('t2', [item('x')]), { type: 'loose', x: 600, y: 0 });
    const mine = setItems(setItems(base, 't1', [item('a', [item('a1'), item('a2')])]), 't2', [item('x'), item('b')]);
    const theirs = setText(base, 'n1', 'other');
    const merged = mergeBoards(base, mine, theirs);
    expect(shape(items(merged, 't1'))).toBe('a(a1 a2)');
    expect(shape(items(merged, 't2'))).toBe('x b');
  });

  it('two people nesting two items inside each other loses neither', () => {
    const base = sample();
    const mine = setItems(base, 't1', [item('a', [item('a1'), item('a2'), item('b')])]);
    const theirs = setItems(base, 't1', [item('b', [item('a', [item('a1'), item('a2')])])]);
    const merged = items(mergeBoards(base, mine, theirs), 't1');
    const all = shape(merged);
    for (const id of ['a', 'a1', 'a2', 'b']) expect(all).toContain(id);
  });
});

describe('deleting', () => {
  it('a card one person deletes and the other leaves alone is gone', () => {
    const base = sample();
    const merged = mergeBoards(base, B.deleteCard(base, 'n1'), setText(base, 'n2', 'x'));
    expect(merged.cards.n1).toBeUndefined();
    expect(merged.order).not.toContain('n1');
    expect(B.problems(merged)).toEqual([]);
  });

  it('a card they delete while I edit it is kept (nothing typed is lost)', () => {
    const base = sample();
    const merged = mergeBoards(base, setText(base, 'n1', 'mine'), B.deleteCard(base, 'n1'));
    expect(text(merged, 'n1')).toBe('mine');
    expect(B.problems(merged)).toEqual([]);
  });

  it('a column I delete takes its cards, but a card they edited in it stays, loose', () => {
    const base = sample();
    const merged = mergeBoards(base, B.deleteColumn(base, 'c1'), setText(base, 'n2', 'typed'));
    expect(merged.columns.c1).toBeUndefined();
    expect(text(merged, 'n2')).toBe('typed');
    expect(merged.order).toContain('n2');
    expect(B.problems(merged)).toEqual([]);
  });

  it('an item they delete is gone; its parent keeps my other edits', () => {
    const base = sample();
    const mine = setItems(base, 't1', [item('a', [item('a1'), item('a2')], 'A!'), item('b')]);
    const theirs = setItems(base, 't1', [item('a', [item('a1')]), item('b')]);
    const merged = items(mergeBoards(base, mine, theirs), 't1');
    expect(shape(merged)).toBe('a(a1) b');
    expect(merged[0].text).toBe('A!');
  });

  it('arrows to a block someone deleted go too', () => {
    const base = { ...sample(), arrows: [{ id: 'r1', from: 'n1', to: 'c1' }] };
    const merged = mergeBoards(base, setText(base, 'n2', 'x'), B.deleteCard(base, 'n1'));
    expect(merged.arrows ?? []).toEqual([]);
  });
});

describe('same thing changed by both', () => {
  it('mine wins', () => {
    const base = sample();
    const merged = mergeBoards(base, setText(base, 'n1', 'mine'), setText(base, 'n1', 'theirs'));
    expect(text(merged, 'n1')).toBe('mine');
  });
});

describe('several boards', () => {
  it('boards both changed are combined; boards added on either side kept', () => {
    const base = { home: sample(), sub: B.createBoard() };
    const mine = { ...base, home: setText(base.home, 'n1', 'mine'), mineNew: B.createBoard() };
    const theirs = { ...base, home: setText(base.home, 'n2', 'theirs'), sub: B.renameBoard(base.sub, 'Sub') };
    const merged = mergeBoardSets(base, mine, theirs);
    expect(text(merged.home, 'n1')).toBe('mine');
    expect(text(merged.home, 'n2')).toBe('theirs');
    expect(merged.sub.name).toBe('Sub');
    expect(merged.mineNew).toBeDefined();
  });

  it('a board deleted by one and untouched by the other is gone; edited, it is kept', () => {
    const home = B.addCard(sample(), createBoardCard('sub', 'bc'), { type: 'loose', x: 0, y: 500 });
    const base = { home, sub: B.createBoard(), other: B.createBoard() };
    const mine = { home, other: B.renameBoard(base.other, 'Kept') };
    const theirs = { home, sub: base.sub };
    const merged = mergeBoardSets(base, mine, theirs);
    expect(merged.sub).toBeUndefined();
    expect(merged.other.name).toBe('Kept');
  });
});

describe('random edits on both sides', () => {
  // A small repeatable random number source, so a failure can be replayed.
  function rng(seed: number) {
    return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  }

  function randomEdit(b: Board, r: () => number, tag: string): Board {
    const cardIds = Object.keys(b.cards);
    const colIds = Object.keys(b.columns);
    const anyCard = () => cardIds[Math.floor(r() * cardIds.length)];
    const anyCol = () => colIds[Math.floor(r() * colIds.length)];
    const id = `${tag}${Math.floor(r() * 1e6)}`;
    switch (Math.floor(r() * 9)) {
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
        const lists = cardIds.filter((c) => b.cards[c].kind === 'todo');
        if (!lists.length) return B.addCard(b, list(id, [item(`${id}a`)]), { type: 'loose', x: 0, y: 0 });
        const c = lists[Math.floor(r() * lists.length)];
        const xs = items(b, c);
        // Add an item, or nest the last top-level item under the first.
        if (r() < 0.5 || xs.length < 2) return setItems(b, c, [...xs, item(id)]);
        return setItems(b, c, [{ ...xs[0], children: [...xs[0].children, xs[xs.length - 1]] }, ...xs.slice(1, -1)]);
      }
      default:
        return cardIds.length ? B.updateCard(b, anyCard(), (c) => ({ ...c, color: tag === 'm' ? 'rose' : 'sky' })) : b;
    }
  }

  const allItems = (b: Board) =>
    Object.values(b.cards).flatMap((c) => (c.kind === 'todo' ? flat(c.items) : []));
  const flat = (xs: TodoItem[]): string[] => xs.flatMap((x) => [x.id, ...flat(x.children)]);

  it('always gives a healthy board, and agrees with either side when the other did nothing', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      let base = sample();
      for (let i = 0; i < 4; i++) base = randomEdit(base, r, 'b');
      let mine = base;
      let theirs = base;
      for (let i = 0; i < 3; i++) mine = randomEdit(mine, r, 'm');
      for (let i = 0; i < 3; i++) theirs = randomEdit(theirs, r, 't');
      const merged = mergeBoards(base, mine, theirs);
      expect(B.problems(merged), `seed ${seed}`).toEqual([]);
      const ids = allItems(merged);
      expect(new Set(ids).size, `seed ${seed}: an item in two places`).toBe(ids.length);
      for (const a of merged.arrows ?? []) expect(merged.cards[a.from] || merged.columns[a.from]).toBeTruthy();
      expect(mergeBoards(base, base, theirs)).toEqual(theirs);
      expect(mergeBoards(base, mine, base)).toEqual(mine);
      // Combining again with the result changes nothing.
      expect(mergeBoards(theirs, merged, theirs)).toEqual(merged);
    }
  });
});
