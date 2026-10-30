import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

// Ctrl+Enter in a checklist item (owner request, 2026-10-15): ticks it like its Done box, then the
// cursor moves on to the next open item; on a ticked item it unticks it and the cursor stays.

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })); // reduced motion
afterEach(() => vi.unstubAllGlobals());

function setup(names: string[]) {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  s.addCard('todo');
  const cardId = s.getState().ui.selection[0];
  const list = () => s.getState().board.cards[cardId] as TodoCard;
  let at = list().items[0].id;
  for (const [i, n] of names.entries()) {
    if (i) {
      s.itemEnter(cardId, at);
      at = s.getState().ui.focusItem!;
    }
    s.setItemText(cardId, at, n);
  }
  const id = (n: string) => list().items.find((i) => i.text === n)!.id;
  const texts = () => list().items.map((i) => `${i.done ? '+' : ''}${i.text}`).join(' ');
  return { s, cardId, id, texts };
}

describe('Ctrl+Enter in a checklist item', () => {
  it('ticks it, moves the cursor to the item below, and is one undo step', () => {
    const { s, cardId, id, texts } = setup(['a', 'b', 'c']);
    s.tickFromKeyboard(cardId, id('b'), 1);
    expect(texts()).toBe('a +b c'); // "b" now shows in Completed
    expect(s.getState().ui.focusItem).toBe(id('c'));
    s.undo();
    expect(texts()).toBe('a b c');
  });

  it('from the last open item, the cursor goes to the one above', () => {
    const { s, cardId, id } = setup(['a', 'b']);
    s.tickFromKeyboard(cardId, id('b'), 0);
    expect(s.getState().ui.focusItem).toBe(id('a'));
  });

  it('with no open item left, the cursor stays in the item just ticked, so a Delete never reaches the list', () => {
    const { s, cardId, id, texts } = setup(['a', 'b']);
    s.toggleItem(cardId, id('a'));
    s.tickFromKeyboard(cardId, id('b'), 1);
    expect(texts()).toBe('+a +b');
    expect(s.getState().ui.focusItem).toBe(id('b'));
    expect(s.getState().ui.focusOffset).toBe(1);
    expect(s.getState().ui.selection).toEqual([cardId]);
    // The next Delete removes just that ticked item (the card stays).
    s.deleteTickedItem(cardId, id('b'));
    expect(texts()).toBe('+a');
    expect(s.getState().board.cards[cardId]).toBeDefined();
  });

  it('a list of one item: ticking it keeps the cursor in it', () => {
    const { s, cardId, id } = setup(['a']);
    s.tickFromKeyboard(cardId, id('a'), 0);
    expect(s.getState().ui.focusItem).toBe(id('a'));
    expect(s.getState().ui.selection).toEqual([cardId]);
  });

  it('on a ticked item it unticks it and the cursor stays in it, where it was', () => {
    const { s, cardId, id, texts } = setup(['a', 'b']);
    s.toggleItem(cardId, id('a'));
    s.tickFromKeyboard(cardId, id('a'), 1);
    expect(texts()).toBe('a b');
    expect(s.getState().ui.focusItem).toBe(id('a'));
    expect(s.getState().ui.focusOffset).toBe(1);
  });
});
