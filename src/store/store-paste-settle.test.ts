import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from './store';

// Review 181 part B, B-L2 (job 183): a pasted block takes its spot and what it covers moves to the
// nearest free spot (SPEC: "anything it would cover moves to the nearest free spot"), not straight down.
// Blocks that grow (expanding, typing) still push what is below them straight down.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type S = ReturnType<typeof createStore>;

function store() {
  const s = createStore(null);
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

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

describe('B-L2: pasting', () => {
  it('moves a block the copy covers to the nearest free spot, not straight down', () => {
    const s = store();
    const a = noteAt(s, 0, 0);
    const b = noteAt(s, 260, 60);
    s.select(a);
    expect(s.copySelection()).toBe(true);
    expect(s.paste()).toBe(true);
    // As in the browser: the copy is drawn and reports its height before the tidy-up runs.
    s.setMeasuredHeight(s.getState().ui.selection[0], 100);
    vi.runAllTimers();
    const moved = s.getState().board.cards[b];
    expect(moved.y).toBe(60); // beside the copy, in its row
    expect(moved.x).toBeGreaterThan(260);
  });
});

describe('growth still pushes straight down', () => {
  it('a block that grows pushes the one below it down', () => {
    const s = store();
    const a = noteAt(s, 0, 0);
    const below = noteAt(s, 0, 120);
    s.setMeasuredHeight(a, 220);
    vi.runAllTimers();
    expect(s.getState().board.cards[below].x).toBe(0);
    expect(s.getState().board.cards[below].y).toBeGreaterThanOrEqual(230);
  });

  it('a duplicate (Ctrl+D) uses the nearest free spot too', () => {
    const s = store();
    const a = noteAt(s, 0, 0);
    const b = noteAt(s, 260, 60);
    s.select(a);
    expect(s.duplicate()).toBe(true);
    s.setMeasuredHeight(s.getState().ui.selection[0], 100);
    vi.runAllTimers();
    expect(s.getState().board.cards[b].y).toBe(60);
  });
});
