import { describe, expect, it } from 'vitest';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

// Due dates on checklist items (owner request, 2026-10-05).

function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1000, height: 800 });
  s.addCard('todo');
  const cardId = s.getState().board.order[0];
  const itemId = (s.getState().board.cards[cardId] as TodoCard).items[0].id;
  return { s, cardId, itemId };
}
const firstItem = (s: ReturnType<typeof setup>['s'], cardId: string) => (s.getState().board.cards[cardId] as TodoCard).items[0];

describe('due dates', () => {
  it('setting and clearing a due date are ordinary changes (Ctrl+Z undoes them); the picker closes', () => {
    const { s, cardId, itemId } = setup();
    s.openDuePicker(cardId, itemId);
    expect(s.getState().ui.dueFor).toEqual({ cardId, itemId });
    s.setItemDue(cardId, itemId, '2026-10-07');
    expect(firstItem(s, cardId).due).toBe('2026-10-07');
    expect(s.getState().ui.dueFor).toBeNull();
    s.setItemDue(cardId, itemId, null);
    expect(firstItem(s, cardId).due).toBeUndefined();
    s.undo();
    expect(firstItem(s, cardId).due).toBe('2026-10-07');
  });

  it('the Due panel opens and closes; going to an item opens its board, selects its list and puts the cursor in it', () => {
    const { s, cardId, itemId } = setup();
    const home = s.getState().boards.open;
    s.newBoard();
    s.renameBoard('Other');
    s.toggleDuePanel();
    expect(s.getState().ui.dueOpen).toBe(true);
    s.goToItem(home, cardId, itemId);
    expect(s.getState().boards.open).toBe(home);
    expect(s.getState().ui.selection).toEqual([cardId]);
    expect(s.getState().ui.focusItem).toBe(itemId);
    expect(s.getState().ui.dueOpen).toBe(true); // stays open to go through the list
    s.toggleDuePanel();
    expect(s.getState().ui.dueOpen).toBe(false);
  });
});
