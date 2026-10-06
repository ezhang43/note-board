import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

// Delete completed items (owner request, 2026-10-06): Ctrl+Shift+Backspace asks
// "Delete 2 completed items?"; Delete empties every Completed section on the open board, one undo step.

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) }));
afterEach(() => vi.unstubAllGlobals());

/** A store with one checklist: "a" and "b" ticked (in Completed), "c" open. */
function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  s.addCard('todo');
  const cardId = s.getState().ui.selection[0];
  const list = () => s.getState().board.cards[cardId] as TodoCard;
  let at = list().items[0].id;
  for (const t of ['a', 'b', 'c']) {
    if (t !== 'a') {
      s.itemEnter(cardId, at);
      at = s.getState().ui.focusItem!;
    }
    s.setItemText(cardId, at, t);
  }
  for (const t of ['a', 'b']) s.toggleItem(cardId, list().items.find((i) => i.text === t)!.id);
  const texts = () => list().items.map((i) => `${i.done ? '+' : ''}${i.text}`).join(' ');
  return { s, texts };
}

describe('Delete completed items', () => {
  it('asks first with the count, and Keep changes nothing', () => {
    const { s, texts } = setup();
    s.askDeleteCompleted();
    expect(s.getState().ui.deleteCompleted).toBe('ask');
    s.cancelDeleteCompleted();
    expect(s.getState().ui.deleteCompleted).toBeNull();
    expect(texts()).toBe('+a +b c');
  });

  it('Delete removes them, and one Ctrl+Z brings them all back', () => {
    const { s, texts } = setup();
    s.askDeleteCompleted();
    s.confirmDeleteCompleted();
    expect(texts()).toBe('c');
    expect(s.getState().ui.deleteCompleted).toBeNull();
    s.undo();
    expect(texts()).toBe('+a +b c');
  });

  it('with nothing completed, says so and deletes nothing', () => {
    const { s, texts } = setup();
    s.askDeleteCompleted();
    s.confirmDeleteCompleted();
    s.askDeleteCompleted();
    expect(s.getState().ui.deleteCompleted).toBe('none');
    s.confirmDeleteCompleted();
    expect(texts()).toBe('c');
  });

  it('clears a checklist item selection when it deletes', () => {
    const { s } = setup();
    const cardId = s.getState().ui.selection[0];
    const ids = (s.getState().board.cards[cardId] as TodoCard).items.map((i) => i.id);
    s.selectItemRange(cardId, ids[0], ids[2]);
    expect(s.getState().ui.itemSel).not.toBeNull();
    s.askDeleteCompleted();
    s.confirmDeleteCompleted();
    expect(s.getState().ui.itemSel).toBeNull();
  });

  it('does not ask while an old version is being looked at, and looking at one closes the question', () => {
    const { s, texts } = setup();
    s.askDeleteCompleted();
    s.previewVersion({ id: 'v', at: 0 } as never, s.getState().board);
    expect(s.getState().ui.deleteCompleted).toBeNull();
    s.askDeleteCompleted();
    expect(s.getState().ui.deleteCompleted).toBeNull();
    s.confirmDeleteCompleted();
    s.endPreview();
    expect(texts()).toBe('+a +b c');
  });

  it('works on the open board only', () => {
    const { s, texts } = setup();
    const home = s.getState().boards.open;
    // Another board with a completed item of its own.
    const other = s.newBoard();
    s.addCard('todo');
    const listId = s.getState().ui.selection[0];
    s.toggleItem(listId, (s.getState().board.cards[listId] as TodoCard).items[0].id);
    s.openBoard(home);
    const otherBoard = s.getState().boards.others[other];
    s.askDeleteCompleted();
    s.confirmDeleteCompleted();
    expect(texts()).toBe('c');
    expect(s.getState().boards.others[other]).toBe(otherBoard);
    expect((otherBoard.cards[listId] as TodoCard).items[0].done).toBe(true);
  });
});
