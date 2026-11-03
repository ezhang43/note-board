import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_KEY } from '../model/persist';
import { createStore } from './store';

// Arrows between cards and containers (job card-arrows, 2026-11-03).

function setup(storage: Parameters<typeof createStore>[0] = null) {
  const s = createStore(storage, (fn) => fn());
  s.setViewportSize({ width: 1000, height: 800 });
  s.addCard('note');
  s.addCard('note');
  s.addCard('note');
  const [a, b, c] = s.getState().board.order;
  return { s, a, b, c };
}

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('arrows in the store', () => {
  it('drawing an arrow is one undo step; the same two blocks are not joined twice', () => {
    const { s, a, b } = setup();
    expect(s.addArrow(a, b)).toBe(true);
    expect(s.getState().board.arrows).toHaveLength(1);
    expect(s.addArrow(a, b)).toBe(false);
    expect(s.addArrow(b, a)).toBe(false);
    s.undo();
    expect(s.getState().board.arrows).toBeUndefined();
    s.redo();
    expect(s.getState().board.arrows).toHaveLength(1);
  });

  it('a clicked arrow is selected (blocks are let go); Escape lets it go; selecting a block lets it go', () => {
    const { s, a, b } = setup();
    s.addArrow(a, b);
    const id = s.getState().board.arrows![0].id;
    s.select(a);
    s.selectArrow(id);
    expect(s.getState().ui.arrowSel).toBe(id);
    expect(s.getState().ui.selection).toEqual([]);
    s.clearSelection();
    expect(s.getState().ui.arrowSel).toBeNull();
    s.selectArrow(id);
    s.pressBlock(b, false);
    expect(s.getState().ui.arrowSel).toBeNull();
  });

  it('Delete removes the selected arrow, as one undo step', () => {
    const { s, a, b } = setup();
    s.addArrow(a, b);
    const id = s.getState().board.arrows![0].id;
    s.selectArrow(id);
    expect(s.deleteArrow(id)).toBe(true);
    expect(s.getState().board.arrows).toBeUndefined();
    expect(s.getState().ui.arrowSel).toBeNull();
    s.undo();
    expect(s.getState().board.arrows).toHaveLength(1);
  });

  it('deleting a card takes its arrows with it, in the same undo step', () => {
    const { s, a, b, c } = setup();
    s.addArrow(a, b);
    s.addArrow(b, c);
    s.select(a);
    s.deleteSelection();
    expect(s.getState().board.arrows!.map((r) => [r.from, r.to])).toEqual([[b, c]]);
    s.undo();
    expect(s.getState().board.cards[a]).toBeDefined();
    expect(s.getState().board.arrows).toHaveLength(2);
  });

  it('copy and paste copies only the arrows between the copied cards', () => {
    const { s, a, b, c } = setup();
    s.addArrow(a, b);
    s.addArrow(b, c);
    s.pressBlock(a, false);
    s.pressBlock(b, true);
    s.copySelection();
    s.paste();
    const arrows = s.getState().board.arrows!;
    expect(arrows).toHaveLength(3);
    const [x, y] = s.getState().ui.selection;
    expect([arrows[2].from, arrows[2].to]).toEqual([x, y]);
    s.undo();
    expect(s.getState().board.arrows).toHaveLength(2);
  });

  it('arrows are saved and come back after a reload', () => {
    const storage = memoryStorage();
    const { s, a, b } = setup(storage);
    s.addArrow(a, b);
    vi.runAllTimers();
    expect(JSON.parse(storage.m.get(BOARD_KEY)!).version).toBe(5);
    const again = createStore(storage, (fn) => fn());
    expect(again.getState().board.arrows).toEqual(s.getState().board.arrows);
  });

  it('switching boards lets go of a selected arrow', () => {
    const { s, a, b } = setup();
    s.addArrow(a, b);
    s.selectArrow(s.getState().board.arrows![0].id);
    const home = s.getState().boards.open;
    s.newBoard();
    s.openBoard(home);
    expect(s.getState().ui.arrowSel).toBeNull();
  });
});
