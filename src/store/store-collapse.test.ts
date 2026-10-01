import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type S = ReturnType<typeof createStore>;

function store() {
  const s = createStore(null);
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

/** Adds a note and drags it so its top-left is at x, y. */
function noteAt(s: S, x: number, y: number, h = 160): string {
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

const pos = (s: S, id: string) => {
  const b = s.getState().board.cards[id] ?? s.getState().board.columns[id];
  return { x: b.x, y: b.y };
};

/** Collapse `a` (drawn 40 tall), then expand it again (drawn `h` tall). */
function collapseThenExpand(s: S, a: string, h: number) {
  s.toggleCollapsed(a);
  s.setMeasuredHeight(a, 40);
  vi.runAllTimers();
  s.toggleCollapsed(a);
  s.setMeasuredHeight(a, h);
  vi.runAllTimers();
}

describe('collapsing puts pushed blocks back (owner request)', () => {
  it('blocks pushed aside by expanding go back when it collapses again', () => {
    const s = store();
    const a = noteAt(s, 0, 0);
    const b = noteAt(s, 0, 200);
    collapseThenExpand(s, a, 400);
    expect(pos(s, b)).not.toEqual({ x: 0, y: 200 }); // pushed out of the way
    s.toggleCollapsed(a);
    expect(pos(s, b)).toEqual({ x: 0, y: 200 });
    s.setMeasuredHeight(a, 40);
    vi.runAllTimers();
    expect(pos(s, b)).toEqual({ x: 0, y: 200 });
  });

  it('collapsing and its return are one undo step', () => {
    const s = store();
    const a = noteAt(s, 0, 0);
    const b = noteAt(s, 0, 200);
    collapseThenExpand(s, a, 400);
    const pushed = pos(s, b);
    s.toggleCollapsed(a);
    s.undo();
    expect(pos(s, b)).toEqual(pushed);
    expect(s.getState().board.cards[a].collapsed).toBe(false);
  });

  it('a block moved since it was pushed stays where it was put', () => {
    const s = store();
    const a = noteAt(s, 0, 0);
    const b = noteAt(s, 0, 200);
    collapseThenExpand(s, a, 400);
    const c = s.getState().board.cards[b];
    s.startDrag('card', b, c.x, c.y);
    s.moveDrag(800, 0, null);
    s.dropDrag(null);
    s.toggleCollapsed(a);
    expect(pos(s, b)).toEqual({ x: 800, y: 0 });
  });

  it('collapsing without having expanded moves nothing', () => {
    const s = store();
    const a = noteAt(s, 0, 0);
    const b = noteAt(s, 0, 200);
    s.toggleCollapsed(a);
    expect(pos(s, b)).toEqual({ x: 0, y: 200 });
  });
});
