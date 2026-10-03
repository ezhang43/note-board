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

describe('Collapse all, then Expand all, gives back the same layout (owner request)', () => {
  it('opens everything, even cards that were collapsed before; blocks go back to their spots and what they grow into moves straight down', () => {
    const s = store();
    const a = noteAt(s, 0, 0, 200);
    const b = noteAt(s, 0, 220, 40); // already collapsed before Collapse all
    const c = noteAt(s, 0, 280, 160);
    s.toggleCollapsed(b);
    s.setMeasuredHeight(b, 40);
    vi.runAllTimers();
    const before = { a: pos(s, a), b: pos(s, b), c: pos(s, c) };

    s.clearSelection(); // nothing selected: everything
    s.toggleAllCollapsed(); // collapse all
    [a, b, c].forEach((id) => s.setMeasuredHeight(id, 40));
    vi.runAllTimers();
    s.toggleAllCollapsed(); // expand all
    s.setMeasuredHeight(a, 200);
    s.setMeasuredHeight(b, 120); // was collapsed before; now open, so taller
    s.setMeasuredHeight(c, 160);
    vi.runAllTimers();

    for (const id of [a, b, c]) expect(s.getState().board.cards[id].collapsed).toBe(false);
    expect(pos(s, a)).toEqual(before.a);
    expect(pos(s, b)).toEqual(before.b);
    expect(pos(s, c).x).toBe(before.c.x); // straight down, never sideways
    expect(pos(s, c).y).toBeGreaterThanOrEqual(before.b.y + 120);
  });

  it('a block moved while everything was collapsed stays where it was put', () => {
    const s = store();
    const a = noteAt(s, 0, 0, 200);
    s.toggleAllCollapsed();
    s.setMeasuredHeight(a, 40);
    vi.runAllTimers();
    s.startDrag('card', a, 0, 0);
    s.moveDrag(600, 0, null);
    s.dropDrag(null);
    s.toggleAllCollapsed();
    expect(pos(s, a)).toEqual({ x: 600, y: 0 });
    expect(s.getState().board.cards[a].collapsed).toBe(false);
  });
});

describe('Same width (owner request)', () => {
  it('every selected loose card and column takes the width of the first selected; one undo step', () => {
    const s = store();
    const a = noteAt(s, 0, 0);
    const b = noteAt(s, 0, 400);
    s.addColumn();
    const col = s.getState().ui.selection[0];
    s.select(a);
    s.showResize({ kind: 'card', id: a, w: 360, h: null, liveW: 360, liveH: null, matchIds: [], label: '', labelAt: { x: 0, y: 0 } });
    s.commitResize();
    s.select(a);
    s.pressBlock(b, true);
    s.pressBlock(col, true);
    s.matchWidths();
    expect(s.getState().board.cards[b].w).toBe(360);
    expect(s.getState().board.columns[col].w).toBe(360);
    s.undo();
    expect(s.getState().board.cards[b].w).toBeNull();
  });
});

describe('alignment guides while dragging (owner request)', () => {
  it('a dragged card lines up with a nearby block\'s edge, shows a guide, and lands there (the guide wins over the grid)', () => {
    const s = store();
    const a = noteAt(s, 0, 0);
    s.showResize({ kind: 'card', id: a, w: 250, h: null, liveW: 250, liveH: null, matchIds: [], label: '', labelAt: { x: 0, y: 0 } });
    s.commitResize();
    const b = noteAt(s, 600, 400);
    s.startDrag('card', b, 600, 400);
    s.moveDrag(12, 400, null); // b is 240 wide: its right edge (252) is 2px from a's (250)
    const d = s.getState().ui.drag!;
    expect(d.x).toBe(10);
    expect(d.guides.some((g) => g.axis === 'x' && g.at === 250)).toBe(true);
    s.dropDrag(null);
    expect(pos(s, b)).toEqual({ x: 10, y: 400 });
    expect(s.getState().ui.drag).toBeNull();
  });
});

describe('Collapse all closes the gaps (owner request)', () => {
  it('blocks below move straight up under the collapsed ones; Expand all puts them back', () => {
    const s = store();
    const a = noteAt(s, 0, 0, 300);
    const b = noteAt(s, 0, 320, 100);
    s.clearSelection();
    s.toggleAllCollapsed();
    s.setMeasuredHeight(a, 40);
    s.setMeasuredHeight(b, 40);
    vi.runAllTimers();
    expect(pos(s, b)).toEqual({ x: 0, y: 60 });
    s.toggleAllCollapsed();
    s.setMeasuredHeight(a, 300);
    s.setMeasuredHeight(b, 100);
    vi.runAllTimers();
    expect(pos(s, b)).toEqual({ x: 0, y: 320 });
  });
});

describe('Collapse all / Expand all with blocks selected (owner request)', () => {
  it('acts on the selected blocks only', () => {
    const s = store();
    const a = noteAt(s, 0, 0);
    const b = noteAt(s, 600, 0);
    s.select(a);
    s.toggleAllCollapsed();
    expect(s.getState().board.cards[a].collapsed).toBe(true);
    expect(s.getState().board.cards[b].collapsed).toBe(false);
    s.toggleAllCollapsed(); // everything selected is collapsed: expands them
    expect(s.getState().board.cards[a].collapsed).toBe(false);
    s.clearSelection();
    s.toggleAllCollapsed();
    expect([s.getState().board.cards[a].collapsed, s.getState().board.cards[b].collapsed]).toEqual([true, true]);
  });
});

describe('a board from another device is not re-arranged with this device\'s old heights (owner bug report)', () => {
  it('blocks stay where the other device put them until they are drawn again here', () => {
    const s = store();
    const a = noteAt(s, 0, 0, 300); // drawn open and tall here
    const b = noteAt(s, 0, 320, 100);
    // The other device collapsed everything and closed the gap.
    const theirs = structuredClone(s.getState().board);
    theirs.cards[a].collapsed = true;
    theirs.cards[b].collapsed = true;
    theirs.cards[b].y = 60;
    s.replaceBoard(theirs);
    vi.runAllTimers();
    expect(pos(s, b)).toEqual({ x: 0, y: 60 }); // not pushed back below a's old 300px height
    // Once drawn here at their real heights, still nothing moves.
    s.setMeasuredHeight(a, 40);
    s.setMeasuredHeight(b, 40);
    vi.runAllTimers();
    expect(pos(s, b)).toEqual({ x: 0, y: 60 });
  });
});
