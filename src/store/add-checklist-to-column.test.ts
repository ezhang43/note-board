import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from './store';

// A container's + button (owner request, 2026-11-10): a new checklist in that container; at the top (owner request, 2026-11-11).

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function withColumn() {
  const s = createStore(null);
  s.setViewportSize({ width: 1200, height: 800 });
  s.addColumn();
  const col = s.getState().ui.selection[0];
  s.addCard('note'); // into the selected container
  s.addCard('note');
  return { s, col };
}

describe('addCardToColumn', () => {
  it('adds an untitled checklist as the first card, selected, with the cursor in its title', () => {
    const { s, col } = withColumn();
    const before = s.getState().board.columns[col].cardIds;
    expect(before).toHaveLength(2);
    s.clearSelection();
    s.addCardToColumn(col, 'todo');
    const after = s.getState().board.columns[col].cardIds;
    expect(after).toHaveLength(3);
    expect(after.slice(1)).toEqual(before);
    const id = after[0];
    expect(s.getState().board.cards[id].kind).toBe('todo');
    expect(s.getState().ui.selection).toEqual([id]);
    expect(s.getState().ui.focusBlock).toBe(id);
  });

  it('puts it at the top of an empty container too, and leaves the container where it was', () => {
    const s = createStore(null);
    s.setViewportSize({ width: 1200, height: 800 });
    s.addColumn();
    const col = s.getState().ui.selection[0];
    const { x, y } = s.getState().board.columns[col];
    s.addCardToColumn(col, 'todo');
    const c = s.getState().board.columns[col];
    expect(c.cardIds).toHaveLength(1);
    expect([c.x, c.y]).toEqual([x, y]);
  });

  it('is one undo step', () => {
    const { s, col } = withColumn();
    const before = s.getState().board.columns[col].cardIds;
    s.addCardToColumn(col, 'todo');
    s.undo();
    expect(s.getState().board.columns[col].cardIds).toEqual(before);
    expect(Object.keys(s.getState().board.cards)).toHaveLength(2);
  });

  it('opens a collapsed container in the same step, so the new card shows', () => {
    const { s, col } = withColumn();
    s.toggleCollapsed(col);
    vi.runAllTimers();
    expect(s.getState().board.columns[col].collapsed).toBe(true);
    s.addCardToColumn(col, 'todo');
    expect(s.getState().board.columns[col].collapsed).toBe(false);
    expect(s.getState().board.columns[col].cardIds).toHaveLength(3);
    s.undo();
    expect(s.getState().board.columns[col].collapsed).toBe(true);
    expect(s.getState().board.columns[col].cardIds).toHaveLength(2);
  });

  it('does nothing for a container that is not there', () => {
    const { s } = withColumn();
    const board = s.getState().board;
    s.addCardToColumn('nope', 'todo');
    expect(s.getState().board).toBe(board);
  });
});
