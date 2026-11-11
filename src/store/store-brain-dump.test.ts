import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problems } from '../model/board';
import { parseBrainDump } from '../model/brainDump';
import { IMPORT_MAX_CARDS } from '../model/importFile';
import { NO_LINKS } from './collab';
import { createStore } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function store() {
  const s = createStore(null);
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

const dump = (text: string) => parseBrainDump(text);

describe('Brain dump: adding the cards', () => {
  it('adds one loose card per draft to the open board, in order, and selects them all', () => {
    const s = store();
    s.addCard('note');
    const existing = s.getState().ui.selection[0];
    expect(s.addBrainDump(dump('Buy milk\n[ ] Pack bag\nCall mom'))).toBe(3);
    const { board, ui } = s.getState();
    expect(board.cards[existing]).toBeDefined();
    expect(ui.selection).toHaveLength(3);
    expect(ui.selection.every((id) => board.order.includes(id))).toBe(true);
    const [a, b, c] = ui.selection.map((id) => board.cards[id]);
    expect(a).toMatchObject({ kind: 'note', text: 'Buy milk' });
    expect(b).toMatchObject({ kind: 'todo', title: 'Pack bag' });
    expect(c).toMatchObject({ kind: 'note', text: 'Call mom' });
    expect(problems(board)).toEqual([]);
  });

  it('is ONE undo step, and redo brings them all back', () => {
    const s = store();
    s.addCard('note');
    const before = s.getState().board;
    s.addBrainDump(dump('a\nb\nc\nd\ne'));
    expect(s.getState().board.order).toHaveLength(6);
    s.undo();
    expect(s.getState().board).toBe(before);
    s.redo();
    expect(s.getState().board.order).toHaveLength(6);
  });

  it('puts the cards on the part of the board in view', () => {
    const s = store();
    s.addBrainDump(dump('a\nb\nc'));
    const { board, ui, view } = s.getState();
    for (const id of ui.selection) {
      const c = board.cards[id];
      const sx = c.x * view.zoom + view.panX;
      const sy = c.y * view.zoom + view.panY;
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThan(1200);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sy).toBeLessThan(800);
    }
  });

  it('never covers blocks already on the board', () => {
    const s = store();
    s.addColumn();
    const col = s.getState().board.columns[s.getState().ui.selection[0]];
    s.setMeasuredHeight(col.id, 220);
    s.addBrainDump(dump('a\nb\nc\nd\ne\nf'));
    const b = s.getState().board;
    for (const id of s.getState().ui.selection) {
      const c = b.cards[id];
      expect(c.x + 280 <= col.x || c.x >= col.x + col.w || c.y >= col.y + 220 || c.y + 60 <= col.y).toBe(true);
    }
  });

  it('adds nothing for no drafts, and makes no undo step', () => {
    const s = store();
    expect(s.addBrainDump([])).toBe(0);
    expect(s.getState().board.order).toEqual([]);
    expect(s.getState().ui.canUndo).toBe(false);
  });

  it('saves no estimate on a card', () => {
    const s = store();
    s.addBrainDump(dump('Write report 1h30\n[ ] Pack bag (20m)'));
    expect(JSON.stringify(s.getState().board)).not.toMatch(/estimate|minutes|1h30|20m/);
  });

  it('takes the most the parser gives, 300 cards, in one step', () => {
    const s = store();
    const text = Array.from({ length: IMPORT_MAX_CARDS + 20 }, (_, i) => `task ${i}`).join('\n');
    expect(s.addBrainDump(dump(text))).toBe(IMPORT_MAX_CARDS);
    s.undo();
    expect(s.getState().board.order).toEqual([]);
  });

  it('lays the lanes out again with the real heights once every card is drawn', () => {
    const s = store();
    s.addBrainDump(dump('a\nb\nc\nd\ne'));
    const ids = s.getState().ui.selection;
    const first = s.getState().board.cards[ids[0]];
    ids.forEach((id, i) => s.setMeasuredHeight(id, i === 0 ? 300 : 100));
    vi.runAllTimers();
    const b = s.getState().board;
    expect(b.cards[ids[0]]).toMatchObject({ x: first.x, y: first.y });
    expect(b.cards[ids[4]].y).toBe(first.y + 100 + 20);
  });

  it('adds nothing to a board that may only be viewed', () => {
    const s = store();
    s.addCard('note');
    const open = s.getState().boards.open;
    s.setShares([{ id: 's1', root: open, boards: [open], owner: false, ownerUid: 'sam', people: [], links: NO_LINKS, role: 'view' }], true);
    const before = s.getState().board;
    expect(s.addBrainDump(dump('a\nb'))).toBe(0);
    expect(s.getState().board).toBe(before);
  });
});

describe('Brain dump: the dialog', () => {
  it('opens and closes, as view state that is not an undo step', () => {
    const s = store();
    expect(s.getState().ui.brainDumpOpen).toBe(false);
    s.openBrainDump();
    expect(s.getState().ui.brainDumpOpen).toBe(true);
    expect(s.getState().ui.canUndo).toBe(false);
    s.closeBrainDump();
    expect(s.getState().ui.brainDumpOpen).toBe(false);
  });

  it('keeps what was typed when closed, clears it once the cards are added, and a new store starts empty', () => {
    const s = store();
    s.openBrainDump();
    s.setBrainDumpText('a\nb');
    s.closeBrainDump();
    expect(s.getState().ui.brainDumpText).toBe('a\nb');
    expect(s.addBrainDump(dump(s.getState().ui.brainDumpText))).toBe(2);
    expect(s.getState().ui.brainDumpText).toBe('');
    s.setBrainDumpText('left over');
    expect(store().getState().ui.brainDumpText).toBe('');
  });

  it('keeps what was typed when the cards could not be added', () => {
    const s = store();
    const open = s.getState().boards.open;
    s.setShares([{ id: 's1', root: open, boards: [open], owner: false, ownerUid: 'sam', people: [], links: NO_LINKS, role: 'view' }], true);
    s.setBrainDumpText('a\nb');
    expect(s.addBrainDump(dump('a\nb'))).toBe(0);
    expect(s.getState().ui.brainDumpText).toBe('a\nb');
  });

  it('does not open on a board that may only be viewed', () => {
    const s = store();
    const open = s.getState().boards.open;
    s.setShares([{ id: 's1', root: open, boards: [open], owner: false, ownerUid: 'sam', people: [], links: NO_LINKS, role: 'view' }], true);
    s.openBrainDump();
    expect(s.getState().ui.brainDumpOpen).toBe(false);
  });
});
