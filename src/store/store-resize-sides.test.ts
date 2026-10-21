import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from './store';

// Letting go of a resize from the left or top edge (owner request 2026-10-21, job 135).

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
const show = (s: S, id: string, r: { dir: 'w' | 'n' | 'nw'; x: number; y: number; w: number; h: number | null }) =>
  s.showResize({ kind: 'card', id, ...r, liveW: r.w, liveH: r.h, liveX: r.x, liveY: r.y, matchIds: [], label: '', labelAt: { x: 0, y: 0 } });

describe('resizing from the left edge', () => {
  it('moves x so the right edge stays, slides the row’s left neighbours left on release only, and is one undo step', () => {
    const s = store();
    const a = noteAt(s, 0, 0);
    const b = noteAt(s, 400, 0);
    const bw = card(s, b).w ?? 240;
    const right = 400 + bw;
    // Still dragging: nothing has changed on the board.
    show(s, b, { dir: 'w', x: 300, y: 0, w: right - 300, h: null });
    expect(card(s, a).x).toBe(0);
    expect(card(s, b).x).toBe(400);
    s.commitResize();
    expect(card(s, b)).toMatchObject({ x: 300, w: right - 300 });
    expect(card(s, b).x + (card(s, b).w ?? 0)).toBe(right);
    // a ends at 240: it now has to end 10px before b's left edge, on the grid.
    expect(card(s, a).x + (card(s, a).w ?? 240)).toBeLessThanOrEqual(300 - 10);
    s.undo();
    expect(card(s, b)).toMatchObject({ x: 400 });
    expect(card(s, a).x).toBe(0);
  });
});

describe('resizing from the top edge', () => {
  it('moves y so the bottom edge stays and pushes the block above it up', () => {
    const s = store();
    const above = noteAt(s, 0, 0);
    const low = noteAt(s, 0, 140);
    show(s, low, { dir: 'n', x: 0, y: 40, w: card(s, low).w ?? 240, h: 240 });
    s.commitResize();
    expect(card(s, low)).toMatchObject({ y: 40, h: 240 });
    expect(card(s, low).y + 240).toBe(280);
    expect(card(s, above).y).toBeLessThanOrEqual(40 - 10 - 100);
    s.undo();
    expect(card(s, low).y).toBe(140);
    expect(card(s, above).y).toBe(0);
  });
});
