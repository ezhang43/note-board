import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

// Undo or redo while typing in a checklist item (job undo-keeps-cursor, 2026-11-09): when the change takes
// that item off the screen, the cursor goes to the nearest item still drawn in the same list, so it never
// drops to the page, where the next Backspace would delete the whole card.

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })); // reduced motion
afterEach(() => vi.unstubAllGlobals());

/** Puts the cursor in the text box of this checklist item, as the browser would. */
function typeIn(cardId: string, itemId: string, caret?: number) {
  const row = { dataset: { itemId }, closest: () => ({ dataset: { cardId } }) };
  vi.stubGlobal('document', { activeElement: { isContentEditable: false, matches: () => true, closest: () => row, selectionStart: caret } });
}

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
  return { s, cardId, id, list };
}

describe('Ctrl+Z while typing in a checklist item', () => {
  it('that takes away the item being typed in puts the cursor in the item above', () => {
    const { s, cardId, id, list } = setup(['a', 'b']);
    s.itemEnter(cardId, id('b')); // a new item...
    const fresh = s.getState().ui.focusItem!;
    s.focusTaken(fresh);
    typeIn(cardId, fresh); // ...with the cursor in it
    s.undo();
    expect(list().items.map((i) => i.id)).not.toContain(fresh);
    expect(s.getState().ui.focusItem).toBe(id('b'));
    expect(s.getState().ui.selection).toEqual([cardId]); // the card is still selected, as while typing
  });

  it('goes to the item below when there is none above', () => {
    const { s, cardId, id, list } = setup(['a', 'b']);
    s.trashItem(cardId, id('a'));
    s.focusTaken(id('b'));
    s.undo(); // a is back, at the top
    const a = id('a');
    s.focusTaken(a);
    typeIn(cardId, a);
    s.redo(); // a goes again
    expect(list().items.map((i) => i.text)).toEqual(['b']);
    expect(s.getState().ui.focusItem).toBe(id('b'));
  });

  it('keeps the cursor in an item still there, at its place in the text', () => {
    const { s, cardId, id, list } = setup(['a', 'b']);
    const b = id('b');
    typeIn(cardId, b, 1);
    s.setItemText(cardId, b, 'bc');
    s.undo(); // the typing goes, the item stays
    expect(list().items.map((i) => i.id)).toContain(b);
    expect(s.getState().ui.focusItem).toBe(b);
    expect(s.getState().ui.focusOffset).toBe(1);
  });
});

describe('Ctrl+Z that redraws the item being typed in (code review)', () => {
  it('puts the cursor back in an item the undo moved within its list, at the same place in the text', () => {
    const { s, cardId, id, list } = setup(['b', 'a']);
    const a = id('a');
    s.moveItem(cardId, a, -1, 1); // Ctrl+Shift+Up: a goes to the top
    s.focusTaken(a);
    typeIn(cardId, a, 1);
    s.undo(); // a goes back down: its row is moved, which takes the cursor out of it in the browser
    expect(list().items.map((i) => i.text)).toEqual(['b', 'a']);
    expect(s.getState().ui.focusItem).toBe(a);
    expect(s.getState().ui.focusOffset).toBe(1);
  });
});

describe('Ctrl+Y while typing in a checklist item', () => {
  it('that takes away the item being typed in puts the cursor in the item above', () => {
    const { s, cardId, id, list } = setup(['a', 'b', 'c']);
    s.trashItem(cardId, id('b'));
    s.focusTaken(id('a'));
    s.undo(); // b is back
    const b = id('b');
    s.focusTaken(b);
    typeIn(cardId, b);
    s.redo(); // b goes again
    expect(list().items.map((i) => i.text)).toEqual(['a', 'c']);
    expect(s.getState().ui.focusItem).toBe(id('a'));
  });
});

describe('undo that hides the whole list while typing in it', () => {
  it('leaves no item to type in, and the card is let go so Backspace cannot delete it', () => {
    const { s, cardId, id, list } = setup(['a']);
    s.toggleCollapsed(cardId);
    s.toggleCollapsed(cardId); // open again
    s.select(cardId);
    typeIn(cardId, id('a'));
    s.undo(); // collapsed again: no item is drawn
    expect(list().collapsed).toBe(true);
    expect(s.getState().ui.focusItem).toBeNull();
    expect(s.getState().ui.selection).toEqual([]);
    expect(s.deleteSelection()).toBe(false);
    expect(s.getState().board.cards[cardId]).toBeDefined();
  });

  it('lets go of every selected block, so Backspace on the page deletes none of them (code review)', () => {
    const { s, cardId, id } = setup(['a']);
    s.addCard('note');
    const note = s.getState().ui.selection[0];
    s.toggleCollapsed(cardId);
    s.toggleCollapsed(cardId);
    s.select(cardId);
    s.pressBlock(note, true); // the note is selected too
    typeIn(cardId, id('a'));
    s.undo();
    expect(s.getState().ui.selection).toEqual([]);
    expect(s.deleteSelection()).toBe(false);
  });

  it('an undo that removes the whole card leaves the selection as it is without typing', () => {
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1200, height: 800 });
    s.addCard('todo');
    const cardId = s.getState().ui.selection[0];
    const item = (s.getState().board.cards[cardId] as TodoCard).items[0].id;
    typeIn(cardId, item);
    s.undo(); // the new card goes
    expect(s.getState().board.cards[cardId]).toBeUndefined();
    expect(s.getState().ui.focusItem).toBeNull();
    expect(s.getState().ui.selection).toEqual([]);
  });
});

describe('Undo in the phone item bar', () => {
  it("never sends the cursor to an item that isn't drawn (an undo that collapses the card)", () => {
    const { s, cardId, id, list } = setup(['a']);
    s.toggleCollapsed(cardId);
    s.toggleCollapsed(cardId);
    s.select(cardId);
    s.undoInItem(cardId, id('a'), 1);
    expect(list().collapsed).toBe(true);
    expect(s.getState().ui.focusItem).toBeNull();
    expect(s.getState().ui.selection).toEqual([]);
  });

  it('keeps the cursor at its place in an item that stays', () => {
    const { s, cardId, id } = setup(['ab']);
    const ab = id('ab');
    s.setItemText(cardId, ab, 'abc');
    s.undoInItem(cardId, ab, 2);
    expect(s.getState().ui.focusItem).toBe(ab);
    expect(s.getState().ui.focusOffset).toBe(2);
  });
});
