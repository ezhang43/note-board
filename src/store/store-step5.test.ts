import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findItem } from '../model/checklist';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A store with one to-do list holding items typed as "one", "two", "three". */
function setup() {
  const s = createStore(null);
  s.setViewportSize({ width: 1200, height: 800 });
  s.addCard('todo');
  const cardId = s.getState().ui.selection[0];
  const list = () => s.getState().board.cards[cardId] as TodoCard;
  const first = list().items[0].id;
  s.setItemText(cardId, first, 'one');
  s.itemEnter(cardId, first);
  const second = s.getState().ui.focusItem!;
  s.setItemText(cardId, second, 'two');
  s.itemEnter(cardId, second);
  const third = s.getState().ui.focusItem!;
  s.setItemText(cardId, third, 'three');
  return { s, cardId, list, first, second, third };
}

describe('checklist editing in the store', () => {
  it('Enter adds an item and asks for the cursor to move into it', () => {
    const { list, s } = setup();
    expect(list().items.map((i) => i.text)).toEqual(['one', 'two', 'three']);
    expect(s.getState().ui.focusItem).toBe(list().items[2].id);
  });

  it('Tab / Shift+Tab nest and un-nest, and each is one undo step', () => {
    const { s, cardId, list, first, second } = setup();
    s.itemTab(cardId, second, false);
    expect(list().items[0].children.map((c) => c.id)).toEqual([second]);
    s.itemTab(cardId, second, true);
    expect(list().items.map((i) => i.id)[1]).toBe(second);
    s.undo();
    expect(findItem(list().items, second)!.parent?.id).toBe(first);
  });

  it('with several items selected, ticking one ticks them all and unticking one reopens them all', () => {
    const { s, cardId, list, first, third } = setup();
    s.selectItemRange(cardId, first, third);
    expect(s.getState().ui.itemSel?.ids).toHaveLength(3);
    s.toggleItem(cardId, first);
    expect(list().items.every((i) => i.done)).toBe(true);
    s.toggleItem(cardId, third);
    expect(list().items.every((i) => !i.done)).toBe(true);
  });

  it('Delete removes all selected items; cut and paste moves them after the selection', () => {
    const { s, cardId, list, first, second, third } = setup();
    s.selectItemRange(cardId, first, first);
    expect(s.cutItems()).toBe(true);
    expect(list().items.map((i) => i.text)).toEqual(['two', 'three']);
    s.selectItemRange(cardId, third, third);
    expect(s.pasteItems()).toBe(true);
    expect(list().items.map((i) => i.text)).toEqual(['two', 'three', 'one']);
    expect(s.getState().ui.itemSel?.ids).toHaveLength(1);
    s.selectItemRange(cardId, second, third);
    s.deleteSelectedItems();
    expect(list().items.map((i) => i.text)).toEqual(['one']);
  });

  it('dragging items onto the board makes a new list, selected, in the same colour', () => {
    const { s, cardId, list, second } = setup();
    s.startItemDrag(cardId, second, { x: 0, y: 0 });
    s.moveItemDrag({ x: 10, y: 10 }, { newList: { x: 903, y: 517 } });
    s.dropItems();
    const newId = s.getState().ui.selection[0];
    const made = s.getState().board.cards[newId] as TodoCard;
    expect(made).toMatchObject({ kind: 'todo', title: '', color: list().color, x: 900, y: 520 });
    expect(made.items.map((i) => i.text)).toEqual(['two']);
    expect(list().items.map((i) => i.text)).toEqual(['one', 'three']);
    s.undo();
    expect(s.getState().board.cards[newId]).toBeUndefined();
    expect(list().items.map((i) => i.text)).toEqual(['one', 'two', 'three']);
  });

  it('a drag with no drop target changes nothing', () => {
    const { s, cardId, list, second } = setup();
    const before = list();
    s.startItemDrag(cardId, second, { x: 0, y: 0 });
    s.moveItemDrag({ x: 10, y: 10 }, null);
    s.dropItems();
    expect(list()).toBe(before);
    expect(s.getState().ui.itemDrag).toBeNull();
  });

  it('Backspace in an empty item deletes it and puts the cursor in the item above', () => {
    const { s, cardId, list, second, third } = setup();
    s.setItemText(cardId, third, '');
    expect(s.itemBackspace(cardId, third)).toBe(true);
    expect(list().items).toHaveLength(2);
    expect(s.getState().ui.focusItem).toBe(second);
  });
});
