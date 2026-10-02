import { describe, expect, it } from 'vitest';
import { addCard, addColumn, createBoard, problems } from './board';
import { createCard, createColumn } from './cards';
import type { LinkCard, NoteCard } from './types';
import { parseBoard, parseView, readBoard, serializeBoard, serializeView } from './persist';
import { createView } from './view';

function sampleBoard() {
  let b = { ...createBoard(), name: 'Plans – “summer”', snap: false };
  b = addColumn(b, { ...createColumn('c1'), title: 'Ideas', x: 40, y: 60, color: 'rose', collapsed: true });
  b = addCard(b, { ...(createCard('note', 'n1') as NoteCard), text: 'Hello\nthere' }, { type: 'column', columnId: 'c1', index: 0 });
  b = addCard(b, createCard('todo', 't1'), { type: 'loose', x: 400, y: 80 });
  b = addCard(b, { ...(createCard('link', 'l1') as LinkCard), title: 'Docs', url: 'example.com' }, { type: 'column', columnId: 'c1', index: 1 });
  return b;
}

describe('saving the board', () => {
  it('reads back exactly what it wrote, including cards and columns', () => {
    const b = sampleBoard();
    expect(parseBoard(serializeBoard(b))).toEqual(b);
  });

  it('starts a fresh, empty board when nothing is saved', () => {
    expect(parseBoard(null)).toEqual(createBoard());
  });

  it('starts a fresh board instead of crashing on damaged data', () => {
    const damaged = ['not json', '[]', '42', 'null', '{"version":99,"board":{"name":"x"}}', '{"version":2}'];
    for (const raw of damaged) expect(parseBoard(raw)).toEqual(createBoard());
  });

  it('keeps a board saved by step 1 (name and snap only)', () => {
    expect(parseBoard('{"version":1,"board":{"name":"Kept","snap":false}}')).toEqual({ ...createBoard(), name: 'Kept', snap: false });
  });

  it('keeps good fields and replaces bad ones', () => {
    const raw = JSON.stringify({
      version: 2,
      board: {
        name: 'Kept',
        snap: 'yes',
        cards: { n1: { kind: 'note', text: 42, color: 'neon', x: 'a' }, bad: { kind: 'poster' } },
        columns: {},
        order: ['n1', 'bad'],
      },
    });
    const b = parseBoard(raw);
    expect(b.snap).toBe(true);
    expect(b.cards.n1).toMatchObject({ kind: 'note', text: '', color: 'butter', x: 0 });
    expect(b.cards.bad).toBeUndefined();
    expect(problems(b)).toEqual([]);
  });

  it('repairs broken placement so every card is in exactly one place', () => {
    const raw = JSON.stringify({
      version: 2,
      board: {
        name: 'x',
        snap: true,
        cards: { a: { kind: 'note' }, b: { kind: 'note' }, c: { kind: 'note' } },
        columns: {
          c1: { title: 'One', cardIds: ['a', 'ghost', 'a'] },
          c2: { title: 'Two', cardIds: ['a', 'b'] },
        },
        order: ['c1', 'c2', 'a', 'nothing'],
      },
    });
    const b = parseBoard(raw);
    expect(problems(b)).toEqual([]);
    expect(b.columns.c1.cardIds).toEqual(['a']);
    expect(b.columns.c2.cardIds).toEqual(['b']);
    // c was not placed anywhere, so it is put back loose on the board.
    expect(b.order).toEqual(['c1', 'c2', 'c']);
  });
});

describe('saving the view', () => {
  it('remembers pan and zoom but always starts with the Hand tool', () => {
    const v = { panX: -120, panY: 45.5, zoom: 1.44, tool: 'select' as const, theme: 'light' as const };
    expect(parseView(serializeView(v))).toEqual({ ...v, tool: 'hand' });
  });

  it('falls back to defaults on damaged data and keeps zoom in range', () => {
    expect(parseView('garbage')).toEqual(createView());
    expect(parseView('{"panX":"a","panY":null,"zoom":99}')).toEqual({ ...createView(), zoom: 2.5 });
  });
});

describe('reading a board that may be unreadable', () => {
  it('gives the board for readable data, and nothing for damaged or newer data', () => {
    const board = addCard(createBoard(), createCard('note', 'n1'), { type: 'loose', x: 0, y: 0 });
    expect(readBoard(serializeBoard(board))).toEqual(parseBoard(serializeBoard(board)));
    expect(readBoard('{corrupt')).toBeNull();
    expect(readBoard(null)).toBeNull();
    expect(readBoard(JSON.stringify({ version: 99, board: { name: 'From the future' } }))).toBeNull();
    expect(readBoard(JSON.stringify({ version: 1, board: { name: 'Old', snap: false } }))?.name).toBe('Old');
  });
});

describe("saving a collapsed card's height", () => {
  it('keeps it, and ignores an unreadable one', () => {
    const board = addCard(createBoard(), { ...createCard('todo', 't'), collapsed: true, collapsedH: 140 }, { type: 'loose', x: 0, y: 0 });
    expect(parseBoard(serializeBoard(board)).cards.t.collapsedH).toBe(140);
    const bad = addCard(createBoard(), { ...createCard('todo', 't'), collapsedH: -5 }, { type: 'loose', x: 0, y: 0 });
    expect(parseBoard(serializeBoard(bad)).cards.t.collapsedH).toBeUndefined();
  });
});
