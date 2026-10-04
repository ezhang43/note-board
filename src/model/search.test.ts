import { describe, expect, it } from 'vitest';
import { addCard, addColumn, createBoard } from './board';
import { createCard, createColumn } from './cards';
import { findMatches, rangesIn } from './search';
import type { LinkCard, NoteCard, TodoCard } from './types';

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

  it('a match that is out of sight says what to show instead: the collapsed card or column, or the list whose Completed section is closed', () => {
    let b = sample();
    expect(findMatches(b, 'eggs').map((m) => m.showInstead)).toEqual([null, null, 't1', null, null]);
    b = { ...b, columns: { ...b.columns, c1: { ...b.columns.c1, collapsed: true } } };
    expect(findMatches(b, 'eggs')[0].showInstead).toBe('c1');
    expect(findMatches(b, 'shop')[0].showInstead).toBe(null);
    b = { ...b, cards: { ...b.cards, n1: { ...b.cards.n1, collapsed: true } } };
    expect(findMatches(b, 'cake')[0].showInstead).toBe('n1');
  });
});
