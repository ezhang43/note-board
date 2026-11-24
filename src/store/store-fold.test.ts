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

  it('top-level parent with 1 sub-item folds and unfolds; nested parent with 1 sub-item does not fold', () => {
    const { s, cardId, list, a } = setup();
    // Remove a2 so top-level `a` has only 1 sub-item (`a1`).
    s.trashItem(cardId, a().children[1].id);
    expect(a().children.length).toBe(1);
    s.toggleFold(cardId, a().id);
    expect(a().folded).toBe(true);
    s.toggleFold(cardId, a().id);
    expect(a().folded).toBeUndefined();

    // Add one child under `a1` (depth 1): nested parent with 1 sub-item cannot fold.
    s.itemEnter(cardId, a().children[0].id);
    const grandId = s.getState().ui.focusItem!;
    s.setItemText(cardId, grandId, 'g1');
    s.itemTab(cardId, grandId, false);
    const before = s.getState().board;
    s.toggleFold(cardId, a().children[0].id);
    expect(s.getState().board).toBe(before);

    // Add a second child under `a1` (depth 1): now it can fold.
    s.itemEnter(cardId, grandId);
    const grand2Id = s.getState().ui.focusItem!;
    s.setItemText(cardId, grand2Id, 'g2');
    s.toggleFold(cardId, a().children[0].id);
    expect(a().children[0].folded).toBe(true);
    expect(list().items[0].children[0].children.length).toBe(2);
  });

  it('Tab / Shift+Tab on selected items updates selection when a 1-sub-item folded parent crosses depth 0 <-> depth 1', () => {
    const { s, cardId, list, a } = setup();
    // Make list: top0, a(a1) [folded at depth 0], b
    s.trashItem(cardId, a().children[1].id);
    s.toggleFold(cardId, a().id);
    // Insert a sibling `top0` before `a` so `a` can indent under it.
    s.itemEnter(cardId, a().id, 0, 0);
    const top0Id = list().items[0].id;
    s.setItemText(cardId, top0Id, 'top0');
    const aId = list().items[1].id;
    const a1Id = list().items[1].children[0].id;
    const bId = list().items[2].id;

    // Select folded `a` and `b`, then Tab (indent) -> `a` moves to depth 1 and unfolds, revealing `a1` inside selection.
    s.selectItemRange(cardId, aId, bId);
    expect(s.getState().ui.itemSel?.ids).toEqual([aId, bId]);
    s.tabSelectedItems(false);
    expect(s.getState().ui.itemSel?.ids).toEqual([aId, a1Id, bId]);

    // Shift+Tab (outdent) on [a, a1, b] -> `a` returns to depth 0 and folds again, dropping hidden `a1`.
    s.tabSelectedItems(true);
    expect(s.getState().ui.itemSel?.ids).toEqual([aId, bId]);

    // Indent again, then select [a, a1] with anchor on `a1`, then Shift+Tab -> hidden `a1` is dropped and anchor moves to `a`.
    s.tabSelectedItems(false);
    s.selectItemRange(cardId, a1Id, aId);
    expect(s.getState().ui.itemSel?.anchor).toBe(a1Id);
    s.tabSelectedItems(true);
    expect(s.getState().ui.itemSel?.ids).toEqual([aId]);
    expect(s.getState().ui.itemSel?.anchor).toBe(aId);
  });

  it('dropItems updates kept multi-selection using post-move depth when a 1-sub-item folded parent crosses depth 0 <-> depth 1', () => {
    const { s, cardId, list, a } = setup();
    // Make list: a(a1) [folded at depth 0], b, c
    s.trashItem(cardId, a().children[1].id);
    s.toggleFold(cardId, a().id);
    const aId = list().items[0].id;
    const a1Id = list().items[0].children[0].id;
    const bId = list().items[1].id;
    s.itemEnter(cardId, bId);
    const cId = s.getState().ui.focusItem!;
    s.setItemText(cardId, cId, 'c');

    // Select folded `a` and `b`, drag-nest them under `c` -> `a` is now depth 1 (unfolded), so `a1` is shown and selected.
    s.selectItemRange(cardId, aId, bId);
    s.startItemDrag(cardId, aId, { x: 0, y: 0 });
    s.moveItemDrag({ x: 60, y: 40 }, { cardId, drop: { mode: 'nest', targetId: cId }, markId: cId, markMode: 'nest' });
    s.dropItems();
    expect(s.getState().ui.itemSel?.ids).toEqual([aId, a1Id, bId]);

    // Now drag `a` (depth 1, open with saved folded: true) + `a1` + `b` back to depth 0 (after `c`) -> `a` folds, hiding `a1`.
    s.startItemDrag(cardId, aId, { x: 0, y: 0 });
    s.moveItemDrag({ x: 0, y: 80 }, { cardId, drop: { mode: 'after', targetId: cId }, markId: cId, markMode: 'after' });
    s.dropItems();
    expect(s.getState().ui.itemSel?.ids).toEqual([aId, bId]);
  });
});
