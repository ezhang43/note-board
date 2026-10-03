import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findItem } from '../model/checklist';
import type { TodoCard } from '../model/types';
import { COMPLETE_LEAVE_MS, createStore } from './store';

// These tests run with motion allowed, so a tick waits for its leaving animation.
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A store with a note and a to-do list holding "one", "two" and a blank third item. */
function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  s.addCard('note');
  const noteId = s.getState().ui.selection[0];
  s.addCard('todo');
  const cardId = s.getState().ui.selection[0];
  const list = () => s.getState().board.cards[cardId] as TodoCard;
  const first = list().items[0].id;
  s.setItemText(cardId, first, 'one');
  s.itemEnter(cardId, first);
  const second = s.getState().ui.focusItem!;
  s.setItemText(cardId, second, 'two');
  s.itemEnter(cardId, second);
  const blank = s.getState().ui.focusItem!;
  const done = (id: string) => findItem(list().items, id)?.item.done;
  return { s, noteId, cardId, list, first, second, blank, done };
}

describe('a tick still animating is never lost', () => {
  it('when a block is deleted straight after', () => {
    const { s, noteId, cardId, first, done } = setup();
    s.toggleItem(cardId, first);
    s.select(noteId);
    s.deleteSelection();
    expect(s.getState().board.cards[noteId]).toBeUndefined();
    expect(done(first)).toBe(true);
  });

  it('when Backspace removes a blank item straight after', () => {
    const { s, cardId, first, blank, list, done } = setup();
    s.toggleItem(cardId, first);
    s.itemBackspace(cardId, blank);
    expect(list().items.some((i) => i.id === blank)).toBe(false);
    expect(done(first)).toBe(true);
  });

  it('when Clean up is pressed straight after', () => {
    const { s, cardId, first, list } = setup();
    s.toggleItem(cardId, first);
    expect(s.cleanUp()).toBe(1);
    expect(list().items.some((i) => i.id === first)).toBe(false);
  });

  it('when a block is pasted straight after', () => {
    const { s, noteId, cardId, first, done } = setup();
    s.select(noteId);
    s.copySelection();
    s.toggleItem(cardId, first);
    s.paste();
    expect(done(first)).toBe(true);
  });

  it('when a block is dropped straight after', () => {
    const { s, noteId, cardId, first, done } = setup();
    const note = s.getState().board.cards[noteId];
    s.toggleItem(cardId, first);
    s.startDrag('card', noteId, note.x, note.y);
    s.moveDrag(note.x + 400, note.y, null);
    s.dropDrag(null);
    expect(done(first)).toBe(true);
  });

  it("and it doesn't undo another device's change that arrives meanwhile", () => {
    const { s, cardId, first, second, list, done } = setup();
    s.toggleItem(cardId, first);
    const remote = structuredClone(s.getState().board);
    findItem((remote.cards[cardId] as TodoCard).items, second)!.item.text = 'from phone';
    s.replaceBoard(remote);
    vi.advanceTimersByTime(COMPLETE_LEAVE_MS + 50);
    expect(findItem(list().items, second)?.item.text).toBe('from phone');
    expect(done(first)).toBe(true);
  });
});

describe('Delete while dragging', () => {
  it('does nothing until the drag is over, and the drop still works', () => {
    const { s, noteId } = setup();
    const note = s.getState().board.cards[noteId];
    s.select(noteId);
    s.startDrag('card', noteId, note.x, note.y);
    s.deleteSelection();
    expect(s.getState().board.cards[noteId]).toBeDefined();
    expect(() => s.moveDrag(note.x + 400, note.y, null)).not.toThrow();
    expect(() => s.dropDrag(null)).not.toThrow();
    expect(s.getState().ui.drag).toBeNull();
  });
});

describe('selecting blocks drops a checklist item selection', () => {
  it('Ctrl+A', () => {
    const { s, cardId, first, second } = setup();
    s.selectItemRange(cardId, first, second);
    expect(s.getState().ui.itemSel).not.toBeNull();
    s.selectAll();
    expect(s.getState().ui.itemSel).toBeNull();
  });

  it('a selection box with Ctrl held', () => {
    const { s, cardId, first, second } = setup();
    s.selectItemRange(cardId, first, second);
    s.startMarquee({ x: 0, y: 0 }, true);
    expect(s.getState().ui.itemSel).toBeNull();
  });
});
