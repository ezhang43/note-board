import { describe, expect, it } from 'vitest';
import { addCard, addColumn, createBoard } from './board';
import { createBoardCard, createCard, createColumn } from './cards';
import { findMatches, findMatchesAcross, rangesIn } from './search';
import type { Board, LinkCard, NoteCard, TodoCard } from './types';
import type { Workspace } from './workspace';

// Search (owner request): find text anywhere on the board, and go to each match.

describe('finding text in one box', () => {
  it('finds every place, ignoring upper / lower case', () => {
    expect(rangesIn('Milk, more milk, MILK', 'milk')).toEqual([[0, 4], [11, 15], [17, 21]]);
  });
  it('finds nothing for an empty or blank search', () => {
    expect(rangesIn('anything', '')).toEqual([]);
    expect(rangesIn('anything', '   ')).toEqual([]);
  });
  it('ignores spaces around what was typed', () => {
    expect(rangesIn('buy eggs', ' eggs ')).toEqual([[4, 8]]);
  });
});

function sample() {
  let b = createBoard();
  b = addColumn(b, { ...createColumn('c1'), title: 'Shopping', x: 0, y: 0 });
  const list: TodoCard = {
    ...(createCard('todo', 't1') as TodoCard),
    title: 'Groceries',
    completedOpen: false,
    items: [
      { id: 'i1', text: 'eggs', done: false, children: [{ id: 'i2', text: 'free range eggs', done: false, children: [] }] },
      { id: 'i3', text: 'old eggs', done: true, children: [] },
    ],
  };
  b = addCard(b, list, { type: 'column', columnId: 'c1', index: 0 });
  b = addCard(b, { ...(createCard('note', 'n1') as NoteCard), text: 'Eggs for the cake' }, { type: 'loose', x: 500, y: 300 });
  b = addCard(b, { ...(createCard('link', 'l1') as LinkCard), title: 'Recipe', url: 'eggs.example.com' }, { type: 'loose', x: 500, y: 0 });
  return b;
}

describe('finding text on the board', () => {
  it('looks in column titles, list titles, items (sub-items and ticked too), notes, link titles and addresses, in board order', () => {
    const m = findMatches(sample(), 'eggs');
    expect(m.map((x) => x.key)).toEqual(['item:t1:i1', 'item:t1:i2', 'item:t1:i3', 'url:l1', 'note:n1']);
    expect(findMatches(sample(), 'shop').map((x) => x.key)).toEqual(['column:c1']);
    expect(findMatches(sample(), 'groc').map((x) => x.key)).toEqual(['title:t1']);
    expect(findMatches(sample(), 'recipe').map((x) => x.key)).toEqual(['title:l1']);
  });

  it('counts each place in a box, with where it is', () => {
    let b = createBoard();
    b = addCard(b, { ...(createCard('note', 'n1') as NoteCard), text: 'aa aa' }, { type: 'loose', x: 0, y: 0 });
    expect(findMatches(b, 'aa').map((m) => [m.key, m.start, m.end])).toEqual([
      ['note:n1', 0, 2],
      ['note:n1', 3, 5],
    ]);
  });

  it('a match that is out of sight says what to show instead: the collapsed card or column (a ticked item is in sight, job 200)', () => {
    let b = sample();
    expect(findMatches(b, 'eggs').map((m) => m.showInstead)).toEqual([null, null, null, null, null]);
    b = { ...b, columns: { ...b.columns, c1: { ...b.columns.c1, collapsed: true } } };
    expect(findMatches(b, 'eggs')[0].showInstead).toBe('c1');
    expect(findMatches(b, 'shop')[0].showInstead).toBe(null);
    b = { ...b, cards: { ...b.cards, n1: { ...b.cards.n1, collapsed: true } } };
    expect(findMatches(b, 'cake')[0].showInstead).toBe('n1');
  });
});

// Search across all boards (owner request, 2026-10-19, job 102).

describe('finding text on all boards', () => {
  const noteOn = (name: string, text: string, id: string) =>
    addCard({ ...createBoard(), name }, { ...(createCard('note', id) as NoteCard), text }, { type: 'loose', x: 0, y: 0 });
  const link = (b: Board, cardId: string, to: string) => addCard(b, createBoardCard(to, cardId), { type: 'loose', x: 400, y: 0 });

  /** Home opens Trips (which opens Paris); Recipes and Journal stand alone. */
  function workspace(): Workspace {
    return {
      home: 'h',
      boards: {
        h: link(noteOn('Home', 'eggs at home', 'n-h'), 'k1', 'trips'),
        trips: link(noteOn('Trips', 'pack eggs', 'n-t'), 'k2', 'paris'),
        paris: noteOn('Paris', 'no match here', 'n-p'),
        recipes: noteOn('Recipes', 'Eggs and EGGS', 'n-r'),
        journal: noteOn('Journal', 'eggs for breakfast', 'n-j'),
      },
    };
  }
  const where = (ws: Workspace, from: string, q: string) => findMatchesAcross(ws, from, q).map((m) => `${m.boardId}/${m.key}:${m.start}`);
  const boardsOf = (ws: Workspace, from: string, q: string) => findMatchesAcross(ws, from, q).map((m) => m.boardId);

  it('finds matches on every board, with the board each is on, counting every place in a box', () => {
    expect(where(workspace(), 'h', 'eggs')).toEqual(['h/note:n-h:0', 'trips/note:n-t:5', 'recipes/note:n-r:0', 'recipes/note:n-r:9', 'journal/note:n-j:0']);
  });

  it('puts the starting board first, then the others in the Boards menu order (sub-boards under their board)', () => {
    expect(boardsOf(workspace(), 'recipes', 'eggs')).toEqual(['recipes', 'recipes', 'h', 'trips', 'journal']);
    expect(boardsOf(workspace(), 'trips', 'eggs')).toEqual(['trips', 'h', 'recipes', 'recipes', 'journal']);
    expect(boardsOf(workspace(), 'journal', 'eggs')).toEqual(['journal', 'h', 'trips', 'recipes', 'recipes']);
  });

  it('uses the same match rules as one board (case, spaces around the words)', () => {
    const ws = workspace();
    for (const id of Object.keys(ws.boards)) {
      const own = findMatches(ws.boards[id], ' EGGS ');
      const across = findMatchesAcross(ws, id, ' EGGS ').filter((m) => m.boardId === id);
      expect(across.map((m) => ({ key: m.key, start: m.start, end: m.end, showInstead: m.showInstead }))).toEqual(own);
    }
  });

  it('finds nothing for an empty or blank search, or text that is nowhere', () => {
    expect(findMatchesAcross(workspace(), 'h', '')).toEqual([]);
    expect(findMatchesAcross(workspace(), 'h', '   ')).toEqual([]);
    expect(findMatchesAcross(workspace(), 'h', 'zebra')).toEqual([]);
  });

  it('an unknown starting board is ignored: the menu order is used', () => {
    expect(where(workspace(), 'gone', 'match here')).toEqual(['paris/note:n-p:3']);
    expect(boardsOf(workspace(), 'gone', 'eggs')).toEqual(['h', 'trips', 'recipes', 'recipes', 'journal']);
  });

  it('only reads: the boards come back unchanged', () => {
    const ws = workspace();
    const before = JSON.stringify(ws);
    findMatchesAcross(ws, 'recipes', 'eggs');
    expect(JSON.stringify(ws)).toBe(before);
  });
});
