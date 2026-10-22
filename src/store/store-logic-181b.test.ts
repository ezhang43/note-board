import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../model/types';
import { NEW_BLOCK_H } from '../model/constants';
import { createStore } from './store';

// Board-logic review 181 (part B): findings reproduced as tests first, then fixed (job 183).

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type S = ReturnType<typeof createStore>;

function store() {
  const s = createStore(null);
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

/** Adds a note and drags it so its top-left is at x, y. */
function noteAt(s: S, x: number, y: number, h = 100): string {
  s.addCard('note');
  const id = s.getState().ui.selection[0];
  const c = s.getState().board.cards[id];
  s.startDrag('card', id, c.x, c.y);
  s.moveDrag(x, y, null);
  s.dropDrag(null);
  s.setMeasuredHeight(id, h);
  vi.runAllTimers();
  return id;
}

const card = (s: S, id: string) => s.getState().board.cards[id];

describe('B-M1: a corner resize from the top leaves a taller row neighbor beside it', () => {
  it('slides it sideways instead of throwing it up', () => {
    const s = store();
    const l = noteAt(s, 40, 80, 200);
    const a = noteAt(s, 300, 100, 100);
    expect(card(s, l)).toMatchObject({ x: 40, y: 80 });
    s.showResize({ kind: 'card', id: a, dir: 'nw', x: 240, y: 80, w: 300, h: 120, liveW: 300, liveH: 120, liveX: 240, liveY: 80, matchIds: [], label: '', labelAt: { x: 0, y: 0 } });
    s.commitResize();
    vi.runAllTimers();
    expect(card(s, l).y).toBe(80);
    expect(card(s, l).x + (card(s, l).w ?? 240)).toBeLessThanOrEqual(240 - 10);
  });
});

describe('B-L1: turning Snap back on', () => {
  it('moves a row neighbor to the nearest free spot, not straight down, and is one undo step', () => {
    const s = store();
    s.toggleSnap(); // off
    const a = noteAt(s, 11, 0);
    const b = noteAt(s, 261, 0);
    expect(card(s, a)).toMatchObject({ x: 11, y: 0 });
    expect(card(s, b)).toMatchObject({ x: 261, y: 0 });
    s.toggleSnap(); // on
    vi.runAllTimers();
    expect(card(s, a)).toMatchObject({ x: 20, y: 0 });
    expect(card(s, b).y).toBe(0);
    s.undo();
    expect(s.getState().board.snap).toBe(false);
    expect(card(s, a).x).toBe(11);
    expect(card(s, b)).toMatchObject({ x: 261, y: 0 });
  });
});

describe('B-L5: importing while an old version is shown', () => {
  it('puts the old version away first, so the cards really are added', () => {
    const s = store();
    s.previewVersion({ id: 'v1', at: 0, hash: 'h', size: 0 } as never, s.getState().board);
    expect(s.getState().ui.preview).not.toBeNull();
    const r = s.importFile('Hello\n\nWorld', 'a.txt');
    expect(s.getState().ui.preview).toBeNull();
    expect(r.added).toBe(2);
    expect(Object.keys(s.getState().board.cards)).toHaveLength(2);
  });
});

describe('B-L9: saving a weight after the last one was removed from a Weight card that holds other text', () => {
  it('uses that card again instead of making a second Weight card', () => {
    vi.setSystemTime(new Date(2026, 9, 21, 10, 0));
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1000, height: 800 });
    s.openHabits();
    s.saveWeight('72.4', '2026-10-19');
    const habits = s.habitsBoard()!;
    s.openBoard(habits);
    const weightId = Object.values(s.getState().board.cards).find((c) => c.kind === 'todo')!.id;
    const blank = (s.getState().board.cards[weightId] as TodoCard).items.find((i) => !i.text)!;
    s.setItemText(weightId, blank.id, 'goal 70');
    s.openBoard(s.workspace().home);
    if (s.getState().ui.sidePanel !== 'habits') s.openHabits();
    s.removeWeight('2026-10-19');
    expect(Object.keys(s.workspace().boards[habits].cards)).toEqual([weightId]);
    expect(s.saveWeight('71.0', '2026-10-20')).toBe(71);
    const cards = Object.values(s.workspace().boards[habits].cards);
    expect(cards).toHaveLength(1);
    expect((cards[0] as TodoCard).items.map((i) => i.text)).toEqual(['goal 70', '2026-10-20 71.0']);
  });
});

describe('B-L14: the landing outline of a card that is not drawn yet', () => {
  it('is as tall as a card, not as a container', () => {
    const s = store();
    noteAt(s, 0, 0, 100);
    s.addCard('note');
    const id = s.getState().ui.selection[0]; // never measured
    const c = card(s, id);
    s.startDrag('card', id, c.x, c.y);
    s.moveDrag(10, 10, null);
    const land = s.getState().ui.drag?.land;
    expect(land).not.toBeNull();
    expect(land!.h).toBe(NEW_BLOCK_H.note);
  });
});
