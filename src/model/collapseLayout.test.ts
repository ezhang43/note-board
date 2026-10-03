import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import { closeGaps } from './layout';
import type { Board } from './types';

// Collapsing pulls what is below straight up (owner request): the mirror of growth pushing it down.

const note = (b: Board, id: string, x: number, y: number) => B.addCard(b, createCard('note', id), { type: 'loose', x, y });
const at = (b: Board) => Object.fromEntries(b.order.map((id) => [id, { x: B.blockOf(b, id)!.x, y: B.blockOf(b, id)!.y }]));
const y = (b: Board, id: string) => B.blockOf(b, id)!.y;

describe('closing the gaps after collapsing', () => {
  it('a block below moves up by as much as the block above it shrank, keeping its spacing', () => {
    let b = note(note(B.createBoard(), 'a', 0, 0), 'b', 0, 320);
    const open = { a: 300, b: 100 };
    const now = { a: 40, b: 100 };
    b = closeGaps(b, at(b), open, (id) => now[id as 'a']);
    expect(y(b, 'a')).toBe(0);
    expect(y(b, 'b')).toBe(60); // 40 tall + the same 20px gap as before
  });

  it('works down a whole stack', () => {
    let b = note(note(note(B.createBoard(), 'a', 0, 0), 'b', 0, 320), 'c', 0, 540);
    const open = { a: 300, b: 200, c: 100 };
    const now = { a: 40, b: 40, c: 40 };
    b = closeGaps(b, at(b), open, (id) => now[id as 'a']);
    expect([y(b, 'a'), y(b, 'b'), y(b, 'c')]).toEqual([0, 60, 120]);
  });

  it('blocks to the side are left alone, and a block under two only moves as far as both allow', () => {
    let b = note(note(note(note(B.createBoard(), 'a', 0, 0), 'side', 600, 320), 'wide', 200, 0), 'b', 100, 320);
    // "b" (x 100–340) sits under both "a" (0–240, shrinks) and "wide" (200–440, does not).
    const open = { a: 300, side: 100, wide: 300, b: 100 };
    const now = { a: 40, side: 100, wide: 300, b: 100 };
    b = closeGaps(b, at(b), open, (id) => now[id as 'a']);
    expect(y(b, 'side')).toBe(320);
    expect(y(b, 'b')).toBe(320);
  });

  it('a big gap stays as big; nothing ever moves down', () => {
    let b = note(note(B.createBoard(), 'a', 0, 0), 'b', 0, 800);
    b = closeGaps(b, at(b), { a: 300, b: 100 }, (id) => (id === 'a' ? 40 : 100));
    expect(y(b, 'b')).toBe(540);
    const grew = closeGaps(b, at(b), { a: 40, b: 100 }, (id) => (id === 'a' ? 300 : 100));
    expect(y(grew, 'b')).toBe(540);
  });

  it('is worked out from the positions before collapsing, so doing it again changes nothing', () => {
    let b = note(note(B.createBoard(), 'a', 0, 0), 'b', 0, 320);
    const before = at(b);
    const h = (id: string) => (id === 'a' ? 40 : 100);
    b = closeGaps(b, before, { a: 300, b: 100 }, h);
    expect(closeGaps(b, before, { a: 300, b: 100 }, h)).toEqual(b);
  });

  it('columns move too', () => {
    let b = B.addColumn(B.createBoard(), { ...createColumn('col'), x: 0, y: 0 });
    b = note(b, 'n', 20, 520);
    b = closeGaps(b, at(b), { col: 500, n: 100 }, (id) => (id === 'col' ? 52 : 100));
    expect(y(b, 'n')).toBe(72);
  });
});

describe('collapsing or expanding just the selected blocks (owner request)', () => {
  it('a selected column takes its cards with it; nothing else changes', () => {
    let b = B.addColumn(B.createBoard(), { ...createColumn('col'), x: 0, y: 0 });
    b = B.addCard(b, createCard('note', 'in'), { type: 'column', columnId: 'col', index: 0 });
    b = note(b, 'other', 600, 0);
    b = B.setCollapsedFor(b, ['col'], true);
    expect([b.columns.col.collapsed, b.cards.in.collapsed, b.cards.other.collapsed]).toEqual([true, true, false]);
    expect(B.anyExpanded(b, ['col'])).toBe(false);
    expect(B.anyExpanded(b)).toBe(true);
    b = B.setCollapsedFor(b, ['col'], false);
    expect([b.columns.col.collapsed, b.cards.in.collapsed]).toEqual([false, false]);
  });
});
