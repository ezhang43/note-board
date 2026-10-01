import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_GAP } from '../model/constants';
import { overlaps } from '../model/geometry';
import { createStore } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function store() {
  const s = createStore(null);
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

describe('smooth dragging', () => {
  it('a dragged block follows the pointer exactly, shows its grid landing spot, and lands there', () => {
    const s = store();
    s.addCard('note');
    const id = s.getState().ui.selection[0];
    const c = s.getState().board.cards[id];
    s.startDrag('card', id, c.x, c.y);
    s.moveDrag(c.x + 613, c.y + 407, null);
    const d = s.getState().ui.drag!;
    expect([d.x, d.y]).toEqual([c.x + 613, c.y + 407]); // not jumping in 20px steps
    expect(d.land).toMatchObject({ x: c.x + 620, y: c.y + 400 });
    s.dropDrag(null);
    expect(s.getState().board.cards[id]).toMatchObject({ x: c.x + 620, y: c.y + 400 });
  });

  it('with snap off, the block lands exactly where it was let go', () => {
    const s = store();
    s.toggleSnap();
    s.addCard('note');
    const id = s.getState().ui.selection[0];
    const c = s.getState().board.cards[id];
    s.startDrag('card', id, c.x, c.y);
    s.moveDrag(c.x + 613, c.y + 407, null);
    expect(s.getState().ui.drag!.land).toBeNull();
    s.dropDrag(null);
    expect(s.getState().board.cards[id]).toMatchObject({ x: c.x + 613, y: c.y + 407 });
  });

  it('a group dragged together lands on the grid, keeping its spacing', () => {
    const s = store();
    s.addCard('note');
    const a = s.getState().ui.selection[0];
    s.clearSelection();
    s.addCard('note');
    const b = s.getState().ui.selection[0];
    s.selectAll();
    const pa = { ...s.getState().board.cards[a] };
    const pb = { ...s.getState().board.cards[b] };
    s.startDrag('card', a, pa.x, pa.y);
    s.moveDrag(pa.x + 133, pa.y + 47, null);
    s.dropDrag(null);
    expect(s.getState().board.cards[a]).toMatchObject({ x: pa.x + 140, y: pa.y + 40 });
    expect(s.getState().board.cards[b]).toMatchObject({ x: pb.x + 140, y: pb.y + 40 });
  });
});

describe('dragging a new card from the toolbar', () => {
  it('places it centred under the pointer, top edge just above it, on the grid', () => {
    const s = store();
    s.startNewDrag('note');
    s.moveNewDrag({ x: 500, y: 300 }, { x: 503, y: 311 }, null);
    expect(s.getState().ui.newDrag?.land).toMatchObject({ x: 380, y: 300, w: 240 });
    s.dropNewDrag(null);
    const id = s.getState().ui.selection[0];
    expect(s.getState().board.cards[id]).toMatchObject({ kind: 'note', x: 380, y: 300 });
    expect(s.getState().ui.newDrag).toBeNull();
  });

  it('never lands on top of an existing block', () => {
    const s = store();
    s.startNewDrag('note');
    s.moveNewDrag({ x: 0, y: 0 }, { x: 120, y: 18 }, null);
    s.dropNewDrag(null);
    const first = s.getState().ui.selection[0];
    s.setMeasuredHeight(first, 160);
    s.startNewDrag('link');
    s.moveNewDrag({ x: 0, y: 0 }, { x: 130, y: 40 }, null);
    const land = s.getState().ui.newDrag!.land!;
    const a = s.getState().board.cards[first];
    expect(overlaps(land, { x: a.x, y: a.y, w: 240, h: 160 }, BLOCK_GAP)).toBe(false);
  });

  it('dropped over a column, it goes into the column at the given position', () => {
    const s = store();
    s.addColumn();
    const col = s.getState().ui.selection[0];
    s.addCard('note');
    s.startNewDrag('todo');
    s.moveNewDrag({ x: 1, y: 1 }, { x: 1, y: 1 }, col);
    expect(s.getState().ui.newDrag?.land).toBeNull();
    s.dropNewDrag(0);
    const ids = s.getState().board.columns[col].cardIds;
    expect(ids).toHaveLength(2);
    expect(s.getState().board.cards[ids[0]].kind).toBe('todo');
    expect(s.getState().ui.focusItem).not.toBeNull(); // cursor goes into the new list's item
  });

  it('a new column can be dragged too, but never goes inside another column', () => {
    const s = store();
    s.addColumn();
    const first = s.getState().ui.selection[0];
    s.setMeasuredHeight(first, 220);
    const c = s.getState().board.columns[first];
    s.startNewDrag('column');
    s.moveNewDrag({ x: 1, y: 1 }, { x: c.x + 100, y: c.y + 40 }, first);
    const d = s.getState().ui.newDrag!;
    expect(d.overColumn).toBeNull();
    expect(overlaps(d.land!, { x: c.x, y: c.y, w: c.w, h: 220 }, BLOCK_GAP)).toBe(false);
    s.dropNewDrag(0);
    expect(s.getState().board.order).toHaveLength(2);
    const made = s.getState().board.columns[s.getState().ui.selection[0]];
    expect(made).toMatchObject({ title: 'New column', x: d.land!.x, y: d.land!.y, cardIds: [] });
  });

  it('let go off the board: nothing is added', () => {
    const s = store();
    s.startNewDrag('link');
    s.moveNewDrag(null, null, null);
    s.dropNewDrag(null);
    expect(s.getState().board.order).toEqual([]);
    expect(s.getState().ui.canUndo).toBe(false);
  });
});
