import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Collapse all (owner bug report: loose cards stayed open)', () => {
  it('collapses loose cards as well as columns and the cards in them', () => {
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1200, height: 800 });
    s.addColumn();
    const col = s.getState().ui.selection[0];
    s.select(col);
    s.addCard('todo');
    const inCol = s.getState().ui.selection[0];
    s.clearSelection();
    for (const kind of ['note', 'todo', 'link'] as const) s.addCard(kind);
    const loose = Object.keys(s.getState().board.cards).filter((id) => id !== inCol);
    s.clearSelection(); // nothing selected: everything
    s.toggleAllCollapsed();
    vi.runAllTimers();
    const b = s.getState().board;
    expect(b.columns[col].collapsed).toBe(true);
    expect(b.cards[inCol].collapsed).toBe(true);
    for (const id of loose) expect(b.cards[id].collapsed, b.cards[id].kind).toBe(true);
  });
});
