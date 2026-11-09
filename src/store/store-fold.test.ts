import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

// Folding a parent item's sub-items (owner request, 2026-11-09): saved with the board, one undo step
// per fold or unfold, and Collapse all / Expand all leave item folds alone.

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })); // reduced motion
afterEach(() => vi.unstubAllGlobals());

/** A list: "a" with sub-items "a1" and "a2", then "b". */
function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  s.addCard('todo');
  const cardId = s.getState().ui.selection[0];
  const list = () => s.getState().board.cards[cardId] as TodoCard;
  let at = list().items[0].id;
  for (const [i, n] of ['a', 'a1', 'a2', 'b'].entries()) {
    if (i) {
      s.itemEnter(cardId, at);
      at = s.getState().ui.focusItem!;
    }
    s.setItemText(cardId, at, n);
    if (n === 'a1') s.itemTab(cardId, at, false);
    if (n === 'b') s.itemTab(cardId, at, true);
  }
  const a = () => list().items[0];
  return { s, cardId, list, a };
}

describe('folding a checklist item', () => {
  it('the list is set up as a(a1 a2) b', () => {
    const { list } = setup();
    expect(list().items.map((i) => `${i.text}${i.children.length ? `(${i.children.map((c) => c.text).join(' ')})` : ''}`).join(' ')).toBe('a(a1 a2) b');
  });

  it('a fold and an unfold are one undo step each, and redo puts them back', () => {
    const { s, cardId, a } = setup();
    s.toggleFold(cardId, a().id);
    expect(a().folded).toBe(true);
    s.toggleFold(cardId, a().id);
    expect(a().folded).toBeUndefined();
    s.undo();
    expect(a().folded).toBe(true);
    s.undo();
    expect(a().folded).toBeUndefined();
    s.redo();
    expect(a().folded).toBe(true);
  });

  it('an item with no sub-items does not fold, and no undo step is made', () => {
    const { s, cardId, list } = setup();
    const b = list().items[1];
    const before = s.getState().board;
    s.toggleFold(cardId, b.id);
    expect(s.getState().board).toBe(before);
  });

  it('a fold left with nothing under it goes away: deleting the last sub-items drops it, and undo brings both back', () => {
    const { s, cardId, a } = setup();
    s.toggleFold(cardId, a().id);
    const [a1, a2] = a().children;
    s.trashItem(cardId, a1.id);
    s.trashItem(cardId, a2.id);
    expect(a().children).toEqual([]);
    expect('folded' in a()).toBe(false);
    s.undo();
    expect(a().children.length).toBe(1);
    expect(a().folded).toBe(true);
  });

  it('Collapse all and Expand all leave item folds as they are', () => {
    const { s, cardId, a } = setup();
    s.toggleFold(cardId, a().id);
    s.clearSelection();
    s.toggleAllCollapsed();
    expect(a().folded).toBe(true);
    s.toggleAllCollapsed();
    expect(a().folded).toBe(true);
  });

  it('selected items that get hidden by a fold are let go', () => {
    const { s, cardId, a, list } = setup();
    s.extendItemSelection(cardId, a().children[1].id, list().items[1].id);
    expect(s.getState().ui.itemSel?.ids.length).toBe(2);
    s.toggleFold(cardId, a().id);
    expect(s.getState().ui.itemSel).toBeNull();
  });
});
