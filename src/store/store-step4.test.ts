import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteCard } from '../model/types';
import { createStore } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function store() {
  const s = createStore(null);
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

const board = (s: ReturnType<typeof store>) => s.getState().board;
const ui = (s: ReturnType<typeof store>) => s.getState().ui;
const only = (s: ReturnType<typeof store>) => ui(s).selection[0];

describe('undo and redo for everything', () => {
  it('starts with nothing to undo', () => {
    const s = store();
    expect(ui(s)).toMatchObject({ canUndo: false, canRedo: false });
    s.undo();
    expect(ui(s).canUndo).toBe(false);
  });

  it('a burst of typing is one step, and undo / redo swap it back and forth', () => {
    const s = store();
    s.addCard('note');
    const id = only(s);
    for (const text of ['H', 'He', 'Hel', 'Hello']) {
      s.setNoteText(id, text);
      vi.advanceTimersByTime(200);
    }
    s.undo();
    expect((board(s).cards[id] as NoteCard).text).toBe('');
    expect(ui(s).canRedo).toBe(true);
    s.redo();
    expect((board(s).cards[id] as NoteCard).text).toBe('Hello');
    s.undo();
    s.undo();
    expect(board(s).cards[id]).toBeUndefined();
    expect(ui(s).canUndo).toBe(false);
  });

  it('undoes adding, moving, recolouring, collapsing, resizing, snapping and deleting', () => {
    const s = store();
    s.addColumn();
    const col = only(s);
    s.addCard('note');
    const note = only(s);
    s.select(col);
    s.recolourSelection('rose');
    s.toggleCollapsed(col);
    s.showResize({ kind: 'column', id: col, w: 400, h: null, liveW: 400, liveH: null, matchIds: [], label: '', labelAt: { x: 0, y: 0 } });
    s.commitResize();
    s.toggleSnap();
    s.startDrag('column', col, 0, 0);
    s.moveDrag(600, 400, null);
    s.dropDrag(null);
    s.askDeleteColumn(col);
    s.confirmDelete();
    expect(board(s).order).toEqual([]);

    const steps = 8; // add column, add note, colour, collapse, resize, snap, move, delete
    for (let i = 0; i < steps; i++) s.undo();
    expect(board(s).order).toEqual([]);
    expect(ui(s).canUndo).toBe(false);
    for (let i = 0; i < steps; i++) s.redo();
    expect(board(s).order).toEqual([]);
    expect(ui(s).canRedo).toBe(false);
    s.undo(); // undo the delete
    expect(board(s).columns[col]).toMatchObject({ x: 600, y: 400, w: 400, color: 'rose', collapsed: true });
    expect(board(s).columns[col].cardIds).toEqual([note]);
    expect(board(s).snap).toBe(false);
  });

  it('clearing up overlaps is part of the change that caused it, not a separate step', () => {
    const s = store();
    s.addCard('note');
    const a = only(s);
    s.setMeasuredHeight(a, 100);
    vi.runAllTimers();
    // Grow the note so tall that it would reach a block placed below it.
    s.addCard('link');
    const b = only(s);
    s.setMeasuredHeight(b, 100);
    s.setMeasuredHeight(a, 2000);
    vi.runAllTimers();
    const pos = { x: board(s).cards[b].x, y: board(s).cards[b].y };
    expect(pos).not.toEqual({ x: board(s).cards[a].x, y: board(s).cards[a].y });
    s.undo(); // undoes "add link" — not the automatic clean-up
    expect(board(s).cards[b]).toBeUndefined();
    expect(board(s).cards[a]).toBeDefined();
  });

  it('undo keeps only the selected blocks that still exist', () => {
    const s = store();
    s.addCard('note');
    s.undo();
    expect(ui(s).selection).toEqual([]);
  });
});

describe('selection', () => {
  it('Ctrl / Shift + click adds and removes blocks', () => {
    const s = store();
    s.addCard('note');
    const a = only(s);
    s.clearSelection();
    s.addCard('note');
    const b = only(s);
    s.pressBlock(a, true);
    expect(ui(s).selection).toEqual([b, a]);
    s.pressBlock(b, true);
    expect(ui(s).selection).toEqual([a]);
  });

  it('pressing a block that is part of a bigger selection keeps the selection (to drag them all)', () => {
    const s = store();
    s.addCard('note');
    const a = only(s);
    s.addColumn();
    s.selectAll();
    expect(ui(s).selection).toHaveLength(2);
    s.pressBlock(a, false);
    expect(ui(s).selection).toHaveLength(2);
  });

  it('Ctrl+A selects every column and loose card, not cards inside columns', () => {
    const s = store();
    s.addColumn();
    s.addCard('note'); // goes into the selected column
    s.clearSelection();
    s.addCard('link');
    s.selectAll();
    expect(ui(s).selection).toEqual(board(s).order);
    expect(ui(s).selection).toHaveLength(2);
  });

  it('dragging a selected block moves the whole selection by the same amount', () => {
    const s = store();
    s.addCard('note');
    const a = only(s);
    s.clearSelection();
    s.addColumn();
    const c = only(s);
    s.selectAll();
    const before = { a: { ...board(s).cards[a] }, c: { ...board(s).columns[c] } };
    s.startDrag('card', a, before.a.x, before.a.y);
    s.moveDrag(before.a.x + 200, before.a.y + 100, null);
    expect(ui(s).drag?.group).toEqual([c]);
    s.dropDrag(null);
    expect(board(s).cards[a]).toMatchObject({ x: before.a.x + 200, y: before.a.y + 100 });
    expect(board(s).columns[c]).toMatchObject({ x: before.c.x + 200, y: before.c.y + 100 });
    s.undo();
    expect(board(s).columns[c]).toMatchObject({ x: before.c.x, y: before.c.y });
  });
});

describe('delete key', () => {
  it('deletes loose cards straight away', () => {
    const s = store();
    s.addCard('note');
    expect(s.deleteSelection()).toBe(true);
    expect(board(s).order).toEqual([]);
  });

  it('asks first when the selection includes a column, then deletes everything selected', () => {
    const s = store();
    s.addColumn();
    const col = only(s);
    s.addCard('note');
    s.clearSelection();
    s.addCard('link');
    s.selectAll();
    s.deleteSelection();
    expect(ui(s).confirm).toEqual({ columnId: col, ids: expect.arrayContaining(board(s).order) });
    expect(board(s).order).toHaveLength(2);
    s.confirmDelete();
    expect(board(s).order).toEqual([]);
    expect(board(s).cards).toEqual({});
  });

  it('does nothing with nothing selected', () => {
    expect(store().deleteSelection()).toBe(false);
  });
});

describe('copy, paste, duplicate', () => {
  it('pastes 40px further each time and selects the copies', () => {
    const s = store();
    s.addCard('note');
    const a = only(s);
    const orig = { ...board(s).cards[a] };
    s.copySelection();
    s.paste();
    const p1 = only(s);
    s.paste();
    const p2 = only(s);
    expect(board(s).cards[p1]).toMatchObject({ x: orig.x + 40, y: orig.y + 40 });
    expect(board(s).cards[p2]).toMatchObject({ x: orig.x + 80, y: orig.y + 80 });
  });

  it('pasting with nothing copied does nothing', () => {
    expect(store().paste()).toBe(false);
  });

  it('duplicate copies the selection once, and each duplicate is one undo step', () => {
    const s = store();
    s.addColumn();
    s.duplicate();
    expect(board(s).order).toHaveLength(2);
    expect(board(s).columns[only(s)].title).toBe('New column copy');
    s.undo();
    expect(board(s).order).toHaveLength(1);
  });
});
