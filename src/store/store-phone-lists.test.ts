import { describe, expect, it } from 'vitest';
import { PHONE_MARGIN } from '../model/constants';
import { createStore } from './store';

// Phone: lists fill the screen width (owner request, job 113).

function phone() {
  const s = createStore(null);
  s.setViewportSize({ width: 390, height: 700 });
  return s;
}
const only = (s: ReturnType<typeof phone>) => s.getState().board.cards[s.getState().ui.selection[0]];

describe('a new card made on a phone', () => {
  it('is as wide as the screen less a margin each side, and on the screen', () => {
    const s = phone();
    s.addCard('todo', true);
    const card = only(s);
    expect(card.w).toBe(390 - 2 * PHONE_MARGIN);
    const { panX, zoom } = s.getState().view;
    expect(card.x * zoom + panX).toBeGreaterThanOrEqual(0);
    expect((card.x + card.w!) * zoom + panX).toBeLessThanOrEqual(390);
  });
  it('follows the zoom: zoomed out, the same screen width is more board', () => {
    const s = phone();
    s.zoomAt({ x: 195, y: 350 }, 0.5);
    s.addCard('note', true);
    expect(only(s).w).toBe(Math.round((390 - 2 * PHONE_MARGIN) / s.getState().view.zoom));
  });
  it('is the usual width on a computer', () => {
    const s = phone();
    s.addCard('note');
    expect(only(s).w).toBeNull();
  });
  it('inside a selected container keeps following the container', () => {
    const s = phone();
    s.addColumn();
    s.addCard('todo', true);
    expect(only(s).w).toBeNull();
  });
});

describe('starting to edit a list on a phone', () => {
  it('zooms and pans so its block fills the screen width', () => {
    const s = phone();
    s.addColumn();
    const col = s.getState().board.columns[s.getState().ui.selection[0]];
    s.fitBlockWidth(col.id, { x: 100, y: 200 });
    const { zoom, panX } = s.getState().view;
    expect(zoom).toBeCloseTo((390 - 2 * PHONE_MARGIN) / col.w, 5);
    expect(col.x * zoom + panX).toBeCloseTo(PHONE_MARGIN, 0);
  });
  it('for a card inside a container fits the container', () => {
    const s = phone();
    s.addColumn();
    const col = s.getState().board.columns[s.getState().ui.selection[0]];
    s.addCard('note');
    s.fitBlockWidth(only(s).id, { x: 100, y: 200 });
    expect(s.getState().view.zoom).toBeCloseTo((390 - 2 * PHONE_MARGIN) / col.w, 5);
  });
  it('ignores an unknown id', () => {
    const s = phone();
    const before = s.getState().view;
    s.fitBlockWidth('nope', { x: 0, y: 0 });
    expect(s.getState().view).toEqual(before);
  });
});
