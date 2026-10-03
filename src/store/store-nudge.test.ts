import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as B from '../model/board';
import { createStore } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function store() {
  const s = createStore(null);
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

const board = (s: ReturnType<typeof store>) => s.getState().board;
const only = (s: ReturnType<typeof store>) => s.getState().ui.selection[0];

describe('moving selected blocks with the arrow keys', () => {
  it('moves a selected card one grid step per press; quick presses are one undo step', () => {
    const s = store();
    s.addCard('note');
    const id = only(s);
    const { x, y } = board(s).cards[id];
    expect(s.nudgeSelection(1, 0)).toBe(true);
    s.nudgeSelection(0, 1);
    s.nudgeSelection(0, 1);
    expect(board(s).cards[id]).toMatchObject({ x: x + 20, y: y + 40 });
    s.undo();
    expect(board(s).cards[id]).toMatchObject({ x, y });
  });

  it('moves several selected blocks together, and does nothing with nothing selected', () => {
    const s = store();
    s.addCard('note');
    s.clearSelection();
    s.addColumn();
    s.selectAll();
    const before = board(s);
    s.nudgeSelection(-5, 0);
    for (const id of before.order) {
      const was = before.cards[id] ?? before.columns[id];
      const now = board(s).cards[id] ?? board(s).columns[id];
      expect(now.x).toBe(was.x - 100);
    }
    s.clearSelection();
    expect(s.nudgeSelection(1, 0)).toBe(false);
  });

  it('the moved block keeps its spot and what is in its way moves', () => {
    const s = store();
    s.addCard('note');
    const a = only(s);
    s.clearSelection();
    s.addCard('note');
    const b = only(s);
    const target = board(s).cards[a];
    // Step b towards a until it lands on a's spot.
    const steps = (target.x - board(s).cards[b].x) / 20;
    const vSteps = (target.y - board(s).cards[b].y) / 20;
    s.nudgeSelection(steps, vSteps);
    expect(board(s).cards[b]).toMatchObject({ x: target.x, y: target.y });
    expect(board(s).cards[a].x !== target.x || board(s).cards[a].y !== target.y).toBe(true);
  });

  it('a card inside a column moves up and down the column instead', () => {
    const s = store();
    s.addColumn();
    const col = only(s);
    s.addCard('note');
    s.select(col);
    s.addCard('note');
    const second = only(s);
    const first = board(s).columns[col].cardIds[0];
    s.nudgeSelection(0, -1);
    expect(board(s).columns[col].cardIds).toEqual([second, first]);
    s.nudgeSelection(0, -1); // already at the top
    s.nudgeSelection(1, 0); // sideways does nothing
    expect(board(s).columns[col].cardIds).toEqual([second, first]);
    s.nudgeSelection(0, 1);
    expect(board(s).columns[col].cardIds).toEqual([first, second]);
  });
});

describe('shiftInColumn', () => {
  it('leaves loose cards and the ends of a column alone', () => {
    const s = store();
    s.addCard('note');
    const b = board(s);
    expect(B.shiftInColumn(b, only(s), 1)).toBe(b);
  });
});
