import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import { editItems, setItemsDone } from './checklist';
import type { Board, TodoCard } from './types';

/** Board with column c1 holding cards a, b, c (top to bottom), empty column c2, and loose card z. */
function board(): Board {
  let b = B.createBoard();
  b = B.addColumn(b, { ...createColumn('c1'), x: 40, y: 40 });
  b = B.addColumn(b, { ...createColumn('c2'), x: 400, y: 40, collapsed: true });
  for (const [i, id] of ['a', 'b', 'c'].entries()) b = B.addCard(b, createCard('note', id), { type: 'column', columnId: 'c1', index: i });
  b = B.addCard(b, createCard('link', 'z'), { type: 'loose', x: 800, y: 100 });
  return b;
}

describe('board basics', () => {
  it('starts empty with snap on', () => {
    const b = B.createBoard();
    expect(b.snap).toBe(true);
    expect(b.order).toEqual([]);
  });

  it('returns the same object when nothing changes, so no needless save happens', () => {
    const b = B.createBoard();
    expect(B.renameBoard(b, b.name)).toBe(b);
    expect(B.setSnap(b, true)).toBe(b);
    expect(B.setSnap(b, false).snap).toBe(false);
  });

  it('the test board is healthy', () => {
    expect(B.problems(board())).toEqual([]);
  });
});

describe('adding', () => {
  it('a new card goes at the end of a selected column', () => {
    const b = board();
    expect(B.placementForNewCard(b, 'c1')).toEqual({ type: 'column', columnId: 'c1', index: 3 });
  });

  it('a new card goes directly below a selected card inside a column', () => {
    expect(B.placementForNewCard(board(), 'a')).toEqual({ type: 'column', columnId: 'c1', index: 1 });
    expect(B.placementForNewCard(board(), 'c')).toEqual({ type: 'column', columnId: 'c1', index: 3 });
  });

  it('a new card goes loose on the board when nothing, or a loose card, is selected', () => {
    expect(B.placementForNewCard(board(), null)).toBeNull();
    expect(B.placementForNewCard(board(), 'z')).toBeNull();
  });

  it('adding a card into a collapsed column opens it', () => {
    const b = B.addCard(board(), createCard('note', 'n'), { type: 'column', columnId: 'c2', index: 0 });
    expect(b.columns.c2.collapsed).toBe(false);
    expect(b.columns.c2.cardIds).toEqual(['n']);
    expect(B.problems(b)).toEqual([]);
  });

  it('a new to-do list starts titled "New list" with one blank item', () => {
    const t = createCard('todo') as TodoCard;
    expect(t.title).toBe('New list');
    expect(t.items).toHaveLength(1);
    expect(t.items[0]).toMatchObject({ text: '', done: false, children: [] });
  });

  it('new cards get their default colours', () => {
    expect(createCard('note').color).toBe('butter');
    expect(createCard('todo').color).toBe('mint');
    expect(createCard('link').color).toBe('sky');
    expect(createColumn().color).toBeNull();
  });
});

describe('moving', () => {
  it('drops a card into a column at the given position', () => {
    const b = B.moveCard(board(), 'z', { type: 'column', columnId: 'c1', index: 1 });
    expect(b.columns.c1.cardIds).toEqual(['a', 'z', 'b', 'c']);
    expect(b.order).not.toContain('z');
    expect(B.problems(b)).toEqual([]);
  });

  it('dropping into a collapsed column opens it', () => {
    const b = B.moveCard(board(), 'a', { type: 'column', columnId: 'c2', index: 0 });
    expect(b.columns.c2).toMatchObject({ collapsed: false, cardIds: ['a'] });
    expect(b.columns.c1.cardIds).toEqual(['b', 'c']);
  });

  it('reorders a card within its own column', () => {
    const b = B.moveCard(board(), 'a', { type: 'column', columnId: 'c1', index: 2 });
    expect(b.columns.c1.cardIds).toEqual(['b', 'c', 'a']);
    expect(B.problems(b)).toEqual([]);
  });

  it('dragging a card out of a column makes it loose where it was dropped, on top', () => {
    const b = B.moveCard(board(), 'b', { type: 'loose', x: 600, y: 320 });
    expect(b.columns.c1.cardIds).toEqual(['a', 'c']);
    expect(b.order[b.order.length - 1]).toBe('b');
    expect(b.cards.b).toMatchObject({ x: 600, y: 320 });
    expect(B.problems(b)).toEqual([]);
  });

  it('moving a column keeps its cards and brings it to the front', () => {
    const b = B.moveColumn(board(), 'c1', 200, 300);
    expect(b.columns.c1).toMatchObject({ x: 200, y: 300, cardIds: ['a', 'b', 'c'] });
    expect(b.order[b.order.length - 1]).toBe('c1');
  });

  it('ignores moves to columns that do not exist', () => {
    const b = board();
    expect(B.moveCard(b, 'a', { type: 'column', columnId: 'nope', index: 0 })).toBe(b);
  });
});

describe('collapse, colour and edit', () => {
  it('collapses and opens cards and columns', () => {
    let b = B.toggleCollapsed(board(), 'a');
    b = B.toggleCollapsed(b, 'c1');
    expect(b.cards.a.collapsed).toBe(true);
    expect(b.columns.c1.collapsed).toBe(true);
    b = B.toggleCollapsed(b, 'c1');
    expect(b.columns.c1.collapsed).toBe(false);
  });

  it('auto-colour gives every column a different colour, left to right', () => {
    let b = B.createBoard();
    for (let i = 0; i < 18; i++) b = B.addColumn(b, { ...createColumn(`k${i}`), x: (17 - i) * 300, y: 40 });
    const out = B.autoColour(b);
    const byX = Object.values(out.columns).sort((p, q) => p.x - q.x);
    expect(byX.slice(0, 3).map((c) => c.color)).toEqual(['sky', 'peach', 'mint']);
    expect(new Set(byX.slice(0, 16).map((c) => c.color)).size).toBe(16);
    expect(byX[16].color).toBe('sky'); // only repeats after 16
    expect(B.autoColour(out)).toBe(out); // nothing left to change
    expect(out.cards).toBe(b.cards);
  });

  it('collapse all / expand all covers every card and column', () => {
    const b = board();
    expect(B.anyExpanded(b)).toBe(true);
    const shut = B.setAllCollapsed(b, true);
    expect(Object.values(shut.cards).every((c) => c.collapsed)).toBe(true);
    expect(Object.values(shut.columns).every((c) => c.collapsed)).toBe(true);
    expect(B.anyExpanded(shut)).toBe(false);
    expect(B.setAllCollapsed(shut, true)).toBe(shut);
    const open = B.setAllCollapsed(shut, false);
    expect([...Object.values(open.cards), ...Object.values(open.columns)].every((c) => !c.collapsed)).toBe(true);
  });

  it("recolours listed columns, and listed cards' title bands (cards stay white); null resets", () => {
    const before = board();
    const b = B.recolour(before, ['a', 'c1', 'z'], 'lavender');
    expect(b.columns.c1.color).toBe('lavender');
    expect(b.cards.a.titleColor).toBe('lavender');
    expect(b.cards.z.titleColor).toBe('lavender');
    expect(b.cards.b.titleColor ?? null).toBeNull();
    expect(B.recolour(b, ['a'], 'lavender')).toBe(b);
    const reset = B.recolour(b, ['a', 'c1'], null);
    expect(reset.cards.a.titleColor).toBeNull();
    expect(reset.columns.c1.color).toBeNull();
  });

  it('edits and ticks checklist items, including nested ones', () => {
    let b = B.addCard(B.createBoard(), createCard('todo', 't'), { type: 'loose', x: 0, y: 0 });
    const t = b.cards.t as TodoCard;
    const nested = { id: 'n', text: 'inner', done: false, children: [] };
    b = B.updateCard(b, 't', () => ({ ...t, items: [{ ...t.items[0], children: [nested] }] }));
    b = B.setItemText(b, 't', 'n', 'changed');
    b = editItems(b, 't', (items) => setItemsDone(items, ['n'], true));
    const inner = (b.cards.t as TodoCard).items[0].children[0];
    expect(inner).toMatchObject({ text: 'changed', done: true });
  });
});

describe('deleting', () => {
  it('deletes a card from a column', () => {
    const b = B.deleteCard(board(), 'b');
    expect(b.cards.b).toBeUndefined();
    expect(b.columns.c1.cardIds).toEqual(['a', 'c']);
    expect(B.problems(b)).toEqual([]);
  });

  it('deletes a loose card', () => {
    const b = B.deleteCard(board(), 'z');
    expect(b.order).toEqual(['c1', 'c2']);
    expect(B.problems(b)).toEqual([]);
  });

  it('deleting a column deletes all its cards', () => {
    const b = B.deleteColumn(board(), 'c1');
    expect(b.columns.c1).toBeUndefined();
    expect(Object.keys(b.cards)).toEqual(['z']);
    expect(B.problems(b)).toEqual([]);
  });
});

describe('finding blocks', () => {
  it('blockOf finds a card or a column; topLevelOf gives the column holding a card, or the block itself', () => {
    let b = B.addColumn(B.createBoard(), createColumn('col'));
    b = B.addCard(b, createCard('note', 'in'), { type: 'column', columnId: 'col', index: 0 });
    b = B.addCard(b, createCard('note', 'out'), { type: 'loose', x: 400, y: 0 });
    expect(B.blockOf(b, 'col')?.id).toBe('col');
    expect(B.blockOf(b, 'in')?.id).toBe('in');
    expect(B.blockOf(b, 'gone')).toBeUndefined();
    expect(B.topLevelOf(b, 'in')).toBe('col');
    expect(B.topLevelOf(b, 'out')).toBe('out');
    expect(B.topLevelOf(b, 'col')).toBe('col');
  });
});

describe('resizing a collapsed card (owner request)', () => {
  it('sets its collapsed height, leaving the height it has when open', () => {
    let b = B.addCard(B.createBoard(), { ...createCard('todo', 't'), h: 300 }, { type: 'loose', x: 0, y: 0 });
    b = B.toggleCollapsed(b, 't');
    b = B.resizeCard(b, 't', 320, 120);
    expect(b.cards.t).toMatchObject({ w: 320, h: 300, collapsedH: 120 });
    // Width only (right edge): the collapsed height stays.
    b = B.resizeCard(b, 't', 360);
    expect(b.cards.t).toMatchObject({ w: 360, h: 300, collapsedH: 120 });
  });
});
