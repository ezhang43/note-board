import { describe, expect, it } from 'vitest';
import { createBoard, problems } from './board';
import { EXAMPLE, TEMPLATES, isBlank, templateBoard, templatePreview, type Template } from './templates';
import { parseWorkspace, readWorkspace, serializeWorkspace } from './workspace';
import type { Board, TodoItem } from './types';

// Templates and the example board (owner request, job #162, 2026-10-22): ready-made boards that are
// plain boards in the saved format, so nothing about saving changes.

const all: Template[] = [EXAMPLE, ...TEMPLATES];
const itemsOf = (items: TodoItem[]): TodoItem[] => items.flatMap((i) => [i, ...itemsOf(i.children)]);
const textsOf = (b: Board): string[] =>
  [
    b.name,
    ...Object.values(b.columns).map((c) => c.title),
    ...Object.values(b.cards).flatMap((c) => (c.kind === 'note' ? [c.text] : c.kind === 'todo' ? [c.title, ...itemsOf(c.items).map((i) => i.text)] : [])),
  ];

describe('the template list', () => {
  it('has the six templates the owner picked and the Weekend in Lisbon example, with unique ids and names', () => {
    expect(TEMPLATES.map((t) => t.name)).toEqual(['Weekly plan', 'Project plan', 'Trip plan', 'Reading list', 'Mood board', 'Study plan']);
    expect(EXAMPLE.name).toBe('Weekend in Lisbon');
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
    expect(new Set(all.map((t) => t.name)).size).toBe(all.length);
  });

  it.each(all.map((t) => [t.name, t] as const))('%s makes a healthy board in the saved format', (_name, t) => {
    const board = templateBoard(t);
    expect(board.name).toBe(t.name);
    expect(board.snap).toBe(true);
    expect(problems(board)).toEqual([]);
    expect(board.order).toHaveLength(4);
    // Every container is titled, every list is titled, and there is no private or empty text.
    for (const c of Object.values(board.columns)) {
      expect(c.title.trim()).not.toBe('');
      expect(c.cardIds.length).toBeGreaterThan(0);
    }
    for (const text of textsOf(board)) expect(text.trim()).not.toBe('');
    // Only notes and checklists: a link card would load a picture from a web address.
    expect(Object.values(board.cards).every((c) => c.kind === 'note' || c.kind === 'todo')).toBe(true);
  });

  it.each(all.map((t) => [t.name, t] as const))('%s survives saving and loading unchanged (no new saved shape)', (_name, t) => {
    const board = templateBoard(t);
    const ws = { home: 'home', boards: { home: board, other: createBoard() } };
    const read = readWorkspace(serializeWorkspace(ws));
    expect(read?.legacy).toBe(false);
    expect(read?.ws).toEqual(ws);
  });

  it('keeps the containers side by side so each board opens on one screen', () => {
    for (const t of all) {
      const b = templateBoard(t);
      const xs = b.order.map((id) => b.columns[id].x);
      expect(xs).toEqual([...xs].sort((a, c) => a - c));
      expect(new Set(xs).size).toBe(xs.length);
    }
  });

  it('the example shows ticked items so the Completed section can be seen; templates have only a few', () => {
    const ticked = (t: Template) => Object.values(templateBoard(t).cards).flatMap((c) => (c.kind === 'todo' ? itemsOf(c.items).filter((i) => i.done) : []));
    expect(ticked(EXAMPLE).length).toBeGreaterThanOrEqual(3);
    for (const t of TEMPLATES) expect(ticked(t).length).toBeLessThanOrEqual(2);
  });

  it('uses American English and no web addresses', () => {
    for (const t of all) for (const text of textsOf(templateBoard(t))) expect(text).not.toMatch(/colour|favourite|https?:|www\./i);
  });
});

describe('templateBoard', () => {
  it('gives fresh ids each time, so two boards from one template never share them', () => {
    const a = templateBoard(TEMPLATES[0]);
    const b = templateBoard(TEMPLATES[0]);
    const ids = (x: Board) => [...Object.keys(x.cards), ...Object.keys(x.columns)];
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
    // Same content otherwise.
    expect(textsOf(a)).toEqual(textsOf(b));
  });

  it('nests sub-items and ticks as the example says', () => {
    const lisbon = templateBoard(EXAMPLE);
    const book = Object.values(lisbon.cards).find((c) => c.kind === 'todo' && c.title === 'To book');
    if (book?.kind !== 'todo') throw new Error('no To book list');
    const find = book.items.find((i) => i.text === 'Find a flat near Alfama');
    expect(find?.children.map((i) => [i.text, i.done])).toEqual([['Check the reviews', false], ['Ask Sam about dates', true]]);
  });
});

describe('isBlank', () => {
  it('is true for an empty board and one that only keeps a Completed record', () => {
    expect(isBlank(createBoard())).toBe(true);
    const completed = { id: 'k1', kind: 'completed' as const, color: 'stone' as const, collapsed: false, x: 0, y: 0, w: null, h: null, groups: [] };
    expect(isBlank({ ...createBoard(), cards: { k1: completed }, order: ['k1'] })).toBe(true);
  });

  it('is false once there is any card or container', () => {
    expect(isBlank(templateBoard(TEMPLATES[0]))).toBe(false);
    const fresh = parseWorkspace(null);
    expect(isBlank(fresh.boards[fresh.home])).toBe(true);
  });
});

describe('templatePreview', () => {
  it('draws every container as a share of a box and every card as a share of its container, inside, in order', () => {
    for (const t of all) {
      const board = templateBoard(t);
      const p = templatePreview(board);
      expect(p.columns).toHaveLength(board.order.length);
      for (const [i, c] of p.columns.entries()) {
        expect(c.color).toBe(board.columns[board.order[i]].color);
        expect(c.left).toBeGreaterThanOrEqual(0);
        expect(c.top).toBeGreaterThanOrEqual(0);
        expect(c.left + c.width).toBeLessThanOrEqual(100.001);
        expect(c.top + c.height).toBeLessThanOrEqual(100.001);
        expect(c.cards).toHaveLength(board.columns[board.order[i]].cardIds.length);
        for (const k of c.cards) {
          expect(k.top).toBeGreaterThanOrEqual(0);
          expect(k.top + k.height).toBeLessThanOrEqual(100.001);
        }
      }
      expect(p.columns[0].left).toBeLessThan(p.columns[1].left);
    }
  });
});
