import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completedCardOf } from '../model/completed';
import { CARD_W, GRID } from '../model/constants';
import type { TodoCard } from '../model/types';
import { screenToBoard } from '../model/view';
import { createStore } from './store';

// Completed panel (Job #51): the Completed record is shown in a side panel, not on the board.

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) }));
afterEach(() => vi.unstubAllGlobals());

/** A store with one list: "a" (ticked) and "b". */
function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  s.addCard('todo');
  const cardId = s.getState().ui.selection[0];
  const list = () => s.getState().board.cards[cardId] as TodoCard;
  const first = list().items[0].id;
  s.setItemText(cardId, first, 'a');
  s.itemEnter(cardId, first);
  s.setItemText(cardId, s.getState().ui.focusItem!, 'b');
  s.toggleItem(cardId, first);
  return { s, cardId, first, list };
}

describe('Completed panel', () => {
  it('opens and closes in the side panel spot, closing whatever was there', () => {
    const { s } = setup();
    s.toggleSidePanel('calendar');
    s.toggleSidePanel('completed');
    expect(s.getState().ui.sidePanel).toBe('completed');
    s.toggleSidePanel('completed');
    expect(s.getState().ui.sidePanel).toBeNull();
  });

  it('toolbar Clean up records the items but selects nothing and opens nothing', () => {
    const { s } = setup();
    expect(s.cleanUp()).toBe(1);
    expect(completedCardOf(s.getState().board)!.groups[0].entries.map((e) => e.item.text)).toEqual(['a']);
    expect(s.getState().ui.selection).toEqual([]);
    expect(s.getState().ui.sidePanel).toBeNull();
  });

  it('Select all leaves the Completed record out', () => {
    const { s, cardId } = setup();
    s.cleanUp();
    s.selectAll();
    expect(s.getState().ui.selection).toEqual([cardId]);
  });

  it('unticking in the panel sends the item back, one undo step', () => {
    const { s, first, list } = setup();
    s.cleanUp();
    s.restoreCompleted(first);
    expect(list().items.map((i) => i.text)).toEqual(['b', 'a']);
    expect(completedCardOf(s.getState().board)!.groups).toEqual([]);
    s.undo();
    expect(list().items.map((i) => i.text)).toEqual(['b']);
  });

  it('when its list is gone, the new list goes at the free spot nearest the middle of the screen', () => {
    const { s, cardId, first } = setup();
    s.cleanUp();
    s.deleteCard(cardId);
    expect(s.getState().board.cards[cardId]).toBeUndefined();
    s.restoreCompleted(first);
    const fresh = Object.values(s.getState().board.cards).find((c) => c.kind === 'todo') as TodoCard;
    expect(fresh.items.map((i) => i.text)).toEqual(['a']);
    const centre = screenToBoard(s.getState().view, { x: 600, y: 400 });
    // Centred on the middle of the screen (nothing is in the way there), not beside the hidden record.
    expect(Math.abs(fresh.x + CARD_W / 2 - centre.x)).toBeLessThanOrEqual(GRID);
  });
});
