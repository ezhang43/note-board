import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problems } from '../model/board';
import { CARD_W } from '../model/constants';
import { IMPORT_GAP } from '../model/milanote';
import { createStore } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const sample = readFileSync(new URL('../../e2e/fixtures/milanote-sample.md', import.meta.url), 'utf8');

function store() {
  const s = createStore(null);
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

describe('importing a Milanote export', () => {
  it('adds the cards to the current board, loose and selected, keeping what was there', () => {
    const s = store();
    s.addCard('note');
    const existing = s.getState().ui.selection[0];
    expect(s.importMilanote(sample)).toBe(7);
    const { board, ui } = s.getState();
    expect(board.cards[existing]).toBeDefined();
    expect(ui.selection).toHaveLength(7);
    expect(ui.selection.every((id) => board.order.includes(id))).toBe(true);
    expect(problems(board)).toEqual([]);
  });

  it('is one undo step', () => {
    const s = store();
    s.addCard('note');
    const before = s.getState().board;
    s.importMilanote(sample);
    s.undo();
    expect(s.getState().board).toBe(before);
  });

  it('adds nothing from a file with no content', () => {
    const s = store();
    expect(s.importMilanote('\n\n')).toBe(0);
    expect(s.getState().board.order).toEqual([]);
    expect(s.getState().ui.canUndo).toBe(false);
  });

  it('lays the lanes out again with the real heights once every card is drawn', () => {
    const s = store();
    s.importMilanote('## A\n- [ ] a\n\n## B\n- [ ] b\n\n## C\n- [ ] c\n\n## D\n- [ ] d\n\n## E\n- [ ] e');
    const ids = s.getState().ui.selection;
    const first = s.getState().board.cards[ids[0]];
    ids.forEach((id, i) => s.setMeasuredHeight(id, i === 0 ? 300 : 100));
    vi.runAllTimers();
    const b = s.getState().board;
    // E goes under the shortest lane (B), 20px below it; A's lane is taller now.
    expect(b.cards[ids[4]]).toMatchObject({ x: first.x + CARD_W + IMPORT_GAP, y: first.y + 100 + IMPORT_GAP });
    expect(b.cards[ids[0]]).toMatchObject({ x: first.x, y: first.y });
  });

  it('never covers blocks already on the board', () => {
    const s = store();
    s.addColumn();
    const col = s.getState().board.columns[s.getState().ui.selection[0]];
    s.setMeasuredHeight(col.id, 220);
    s.importMilanote(sample);
    const b = s.getState().board;
    for (const id of s.getState().ui.selection) {
      const c = b.cards[id];
      expect(c.x + CARD_W <= col.x || c.x >= col.x + col.w || c.y >= col.y + 220 || c.y + 100 <= col.y).toBe(true);
    }
  });
});
