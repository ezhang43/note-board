import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResizeDir } from '../model/sizing';
import { createStore } from './store';

// Letting go of a resize: only the edges that moved push blocks, and "beside" and "below" are judged by
// where the block was before the drag (job #142).

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type S = ReturnType<typeof createStore>;

function store() {
  const s = createStore(null);
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

/** Adds a note and drags it so its top-left is at x, y; it is drawn h tall. */
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
const W = 240;

/** A resize as the browser does it: show it while dragging, draw the block at its new height, let go. */
function resize(s: S, id: string, dir: ResizeDir, r: { x: number; y: number; w: number; h: number }) {
  s.showResize({ kind: 'card', id, dir, ...r, liveW: r.w, liveH: r.h, liveX: r.x, liveY: r.y, matchIds: [], label: '', labelAt: { x: 0, y: 0 } });
  s.setMeasuredHeight(id, r.h);
  s.commitResize();
  vi.runAllTimers();
}

describe('a corner resize from the top does not throw a neighbour beside the block upwards', () => {
  it('nw: a shorter card beside it on the left keeps its height and slides left', () => {
    const s = store();
    const a = noteAt(s, 300, 100, 200);
    const l = noteAt(s, 40, 120, 100);
    resize(s, a, 'nw', { x: 240, y: 80, w: 300, h: 220 });
    expect(card(s, a)).toMatchObject({ x: 240, y: 80, w: 300, h: 220 });
    expect(card(s, l).y).toBe(120);
    expect(card(s, l).x + W).toBeLessThanOrEqual(240 - 10);
  });

  it('ne: a shorter card beside it on the right keeps its height and slides right', () => {
    const s = store();
    const a = noteAt(s, 300, 100, 200);
    const r = noteAt(s, 580, 120, 100);
    resize(s, a, 'ne', { x: 300, y: 80, w: 300, h: 220 });
    expect(card(s, a)).toMatchObject({ x: 300, y: 80, w: 300, h: 220 });
    expect(card(s, r).y).toBe(120);
    expect(card(s, r).x).toBeGreaterThanOrEqual(300 + 300 + 10);
  });

  it('a block that really is above still moves up', () => {
    const s = store();
    const a = noteAt(s, 300, 100, 200);
    const above = noteAt(s, 300, -40, 100);
    resize(s, a, 'nw', { x: 240, y: 40, w: 300, h: 260 });
    expect(card(s, above).y).toBeLessThanOrEqual(40 - 10 - 100);
  });
});

describe('growing downwards pushes the block below straight down, not sideways', () => {
  const setup = () => {
    const s = store();
    const a = noteAt(s, 0, 0, 100);
    const b = noteAt(s, 0, 120, 100);
    return { s, a, b };
  };

  it('s', () => {
    const { s, a, b } = setup();
    resize(s, a, 's', { x: 0, y: 0, w: W, h: 300 });
    expect(card(s, b).x).toBe(0);
    expect(card(s, b).y).toBeGreaterThanOrEqual(300 + 10);
  });

  it('se', () => {
    const { s, a, b } = setup();
    resize(s, a, 'se', { x: 0, y: 0, w: 300, h: 300 });
    expect(card(s, b).x).toBe(0);
    expect(card(s, b).y).toBeGreaterThanOrEqual(300 + 10);
  });

  it('sw', () => {
    const { s, a, b } = setup();
    resize(s, a, 'sw', { x: -60, y: 0, w: 300, h: 300 });
    expect(card(s, b).x).toBe(0);
    expect(card(s, b).y).toBeGreaterThanOrEqual(300 + 10);
  });

  it('se still slides a card in its row to the right', () => {
    const { s, a, b } = setup();
    const side = noteAt(s, 260, 0, 100);
    resize(s, a, 'se', { x: 0, y: 0, w: 400, h: 300 });
    expect(card(s, side).x).toBeGreaterThanOrEqual(400 + 10);
    expect(card(s, side).y).toBe(0);
    expect(card(s, b).x).toBe(0);
  });
});
