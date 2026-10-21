import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as B from '../model/board';
import { createCard } from '../model/cards';
import { BOARD_KEY, type StorageLike } from '../model/persist';
import { serializeWorkspace } from '../model/workspace';
import { createStore } from './store';

// Job #148 (fragile-store F1): a tidy-up already queued when another board opens, or when another
// device's boards arrive, ran on the new board with heights that belong to something else.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function memoryStorage(init: Record<string, string> = {}): StorageLike {
  const data: Record<string, string> = { ...init };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
}
/** A schedule that holds the tidy-up until run(), as the browser does (one frame later). */
function queued() {
  const q: (() => void)[] = [];
  return { schedule: (fn: () => void) => void q.push(fn), run: () => q.splice(0).forEach((f) => f()) };
}
/** Home with notes k_a at (0,0) and k_b at (0,200); b_other with k_x at (0,0) and k_y at (0,20). */
function twoBoards() {
  let home = { ...B.createBoard(), name: 'Home' };
  home = B.addCard(home, createCard('note', 'k_a'), { type: 'loose', x: 0, y: 0 });
  home = B.addCard(home, createCard('note', 'k_b'), { type: 'loose', x: 0, y: 200 });
  let other = { ...B.createBoard(), name: 'Other' };
  other = B.addCard(other, createCard('note', 'k_x'), { type: 'loose', x: 0, y: 0 });
  other = B.addCard(other, createCard('note', 'k_y'), { type: 'loose', x: 0, y: 20 });
  return memoryStorage({ [BOARD_KEY]: serializeWorkspace({ home: 'home', boards: { home, b_other: other } }) });
}

it('boards from another device are not re-arranged by a tidy-up queued before they came', () => {
  const q = queued();
  const s = createStore(twoBoards(), q.schedule);
  const ws = s.workspace();
  const remote = B.moveCard(ws.boards.home, 'k_b', { type: 'loose', x: 0, y: 100 });
  s.setMeasuredHeight('k_a', 300);
  s.replaceWorkspace({ ...ws, boards: { ...ws.boards, home: remote } });
  q.run();
  expect(s.getState().board.cards.k_b.y).toBe(100);
});

it('another board opened before a queued tidy-up runs is left as it is', () => {
  const q = queued();
  const s = createStore(twoBoards(), q.schedule);
  s.setMeasuredHeight('k_a', 100);
  s.openBoard('b_other');
  const before = s.getState().board;
  q.run();
  expect(s.getState().board).toBe(before);
});

it('a tidy-up asked for after the swap still runs', () => {
  const q = queued();
  const s = createStore(twoBoards(), q.schedule);
  s.setMeasuredHeight('k_a', 100);
  s.openBoard('b_other');
  s.setMeasuredHeight('k_x', 100);
  q.run();
  expect(s.getState().board.cards.k_y.y).toBeGreaterThanOrEqual(110);
});
