import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

// Phone item bar (owner request, 2026-10-19): Delete and Undo keep the cursor in a text box, so the
// phone keyboard stays up. (Ticking is tickFromKeyboard: see store-ctrl-enter.test.ts.)

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
  s.focusTaken(at);
  const id = (n: string) => list().items.find((i) => i.text === n)!.id;
  const texts = () => list().items.map((i) => i.text).join(' ');
  return { s, cardId, id, texts, list };
}

describe('Delete in the phone item bar', () => {
  it('moves the cursor to the item above, in one undo step', () => {
    const { s, cardId, id, texts } = setup(['a', 'b', 'c']);
    s.trashItem(cardId, id('b'));
    expect(texts()).toBe('a c');
    expect(s.getState().ui.focusItem).toBe(id('a'));
    expect(s.getState().ui.focusOffset).toBeNull(); // at the end of its text
    s.undo();
    expect(texts()).toBe('a b c');
  });

  it('from the first item, the cursor goes to the one below', () => {
    const { s, cardId, id } = setup(['a', 'b']);
    s.trashItem(cardId, id('a'));
    expect(s.getState().ui.focusItem).toBe(id('b'));
  });

  it('deleting the only item leaves a blank one with the cursor in it', () => {
    const { s, cardId, list } = setup(['a']);
    s.trashItem(cardId, list().items[0].id);
    expect(list().items).toHaveLength(1);
    expect(s.getState().ui.focusItem).toBe(list().items[0].id);
  });

  it("an item's own trash can on a computer moves the cursor the same way (job 222)", () => {
    const { s, cardId, id, texts } = setup(['a', 'b']);
    s.trashItem(cardId, id('b'));
    expect(texts()).toBe('a');
    expect(s.getState().ui.focusItem).toBe(id('a'));
  });
});

describe('Undo in the phone item bar', () => {
  it('undoes one step and keeps the cursor in the item, where it was', () => {
    const { s, cardId, id, texts, list } = setup(['a', 'b']);
    const b = id('b');
    s.itemTab(cardId, b, false); // indent b under a
    s.focusTaken(b);
    expect(list().items).toHaveLength(1);
    s.undoInItem(cardId, b, 1);
    expect(texts()).toBe('a b');
    expect(s.getState().ui.focusItem).toBe(b);
    expect(s.getState().ui.focusOffset).toBe(1);
  });

  it('when undo removes the item being typed in, the cursor goes to the item above', () => {
    const { s, cardId, id } = setup(['a']);
    s.itemEnter(cardId, id('a')); // Enter makes a new item...
    const fresh = s.getState().ui.focusItem!;
    s.focusTaken(fresh);
    s.undoInItem(cardId, fresh, 0); // ...and undo takes it away again
    expect(s.getState().ui.focusItem).toBe(id('a'));
  });
});
