import { describe, expect, it } from 'vitest';
import { createStore } from './store';

// Arrows between cards and columns (owner request, 2026-10-05).

function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1000, height: 800 });
  s.addCard('note');
  s.addCard('note');
  const [a, b] = s.getState().board.order;
  return { s, a, b };
}

describe('arrows in the store', () => {
  it('drawing an arrow is one undo step', () => {
    const { s, a, b } = setup();
    expect(s.addArrow(a, b)).toBe(true);
    expect(s.getState().board.arrows).toHaveLength(1);
    expect(s.addArrow(b, a)).toBe(false);
    s.undo();
    expect(s.getState().board.arrows ?? []).toHaveLength(0);
    s.redo();
    expect(s.getState().board.arrows).toHaveLength(1);
  });

  it('a clicked arrow is selected (blocks are let go); Delete removes it; Escape lets it go', () => {
    const { s, a, b } = setup();
    s.addArrow(a, b);
    const id = s.getState().board.arrows![0].id;
    s.selectArrow(id);
    expect(s.getState().ui.arrowSel).toBe(id);
    expect(s.getState().ui.selection).toEqual([]);
    s.clearSelection();
    expect(s.getState().ui.arrowSel).toBeNull();
    s.selectArrow(id);
    expect(s.deleteArrow(id)).toBe(true);
    expect(s.getState().board.arrows).toEqual([]);
    expect(s.getState().ui.arrowSel).toBeNull();
    s.undo();
    expect(s.getState().board.arrows).toHaveLength(1);
  });

  it('deleting a card takes its arrows with it', () => {
    const { s, a, b } = setup();
    s.addArrow(a, b);
    s.select(a);
    s.deleteSelection();
    expect(s.getState().board.arrows).toEqual([]);
  });
});
