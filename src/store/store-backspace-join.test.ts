import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

// Backspace at the very start of a checklist item joins it onto the item shown above (owner bug
// report 2026-11-11), the mirror of Delete at the end of an item.

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
  const texts = () => list().items.map((i) => i.text).join('|');
  return { s, cardId, id, texts };
}

describe('Backspace at the start of a checklist item', () => {
  it('joins it onto the item above, cursor at the join, in one undo step', () => {
    const { s, cardId, id, texts } = setup(['Buy ', 'milk', 'eggs']);
    const above = id('Buy ');
    expect(s.itemBackspaceAtStart(cardId, id('milk'))).toBe(true);
    expect(texts()).toBe('Buy milk|eggs');
    expect(s.getState().ui.focusItem).toBe(above);
    expect(s.getState().ui.focusOffset).toBe(4);
    s.undo();
    expect(texts()).toBe('Buy |milk|eggs');
  });

  it('does nothing on the first item (says so, so the key is left alone)', () => {
    const { s, cardId, id, texts } = setup(['a', 'b']);
    expect(s.itemBackspaceAtStart(cardId, id('a'))).toBe(false);
    expect(texts()).toBe('a|b');
  });
});
