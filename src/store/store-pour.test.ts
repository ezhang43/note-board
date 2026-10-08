import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { displayOrder, findItem } from '../model/checklist';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

// Pouring lists into each other (owner requests, 2026-10-06): a whole list dropped on another,
// a list emptied by dragging its items away, and items dropped on a collapsed list or column.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A store with two lists: A ("a1", "a2") and B ("b1"). */
function setup() {
  const s = createStore(null);
  s.setViewportSize({ width: 1200, height: 800 });
  const makeList = (texts: string[]) => {
    s.clearSelection();
    s.addCard('todo');
    const id = s.getState().ui.selection[0];
    let item = (s.getState().board.cards[id] as TodoCard).items[0].id;
    texts.forEach((t, i) => {
      if (i) {
        s.itemEnter(id, item);
        item = s.getState().ui.focusItem!;
      }
      s.setItemText(id, item, t);
    });
    return id;
  };
  const a = makeList(['a1', 'a2']);
  const b = makeList(['b1']);
  const card = (id: string) => s.getState().board.cards[id] as TodoCard | undefined;
  const texts = (id: string) => displayOrder(card(id)!.items).map((x) => findItem(card(id)!.items, x)!.item.text);
  return { s, a, b, card, texts };
}

describe('dragging a whole list onto another', () => {
  it('outlines the target instead of pushing it aside; dropping pours the items in and the dragged list goes; one undo brings it back', () => {
    const { s, a, b, card, texts } = setup();
    const at = card(a)!;
    s.startDrag('card', a, at.x, at.y);
    s.moveDrag(at.x + 400, at.y, null, b);
    const drag = s.getState().ui.drag!;
    expect(drag.intoList).toBe(b);
    expect(drag.land).toBeNull();
    expect(drag.bumped).toEqual({});
    s.dropDrag(null);
    expect(card(a)).toBeUndefined();
    expect(texts(b)).toEqual(['b1', 'a1', 'a2']);
    expect(s.getState().ui.selection).toEqual([b]);
    s.undo();
    expect(texts(a)).toEqual(['a1', 'a2']);
    expect(texts(b)).toEqual(['b1']);
  });

  it('a note dragged over a list, or a list over itself, is just moved as usual', () => {
    const { s, a, b, card } = setup();
    s.clearSelection();
    s.addCard('note');
    const note = s.getState().ui.selection[0];
    s.startDrag('card', note, 0, 0);
    s.moveDrag(40, 40, null, b);
    expect(s.getState().ui.drag!.intoList).toBeNull();
    s.cancelDrag();
    s.startDrag('card', a, 0, 0);
    s.moveDrag(40, 40, null, a);
    expect(s.getState().ui.drag!.intoList).toBeNull();
    s.dropDrag(null);
    expect(card(a)).toBeDefined();
  });

  it('a list inside a column is not poured into: the dragged list goes into the column as before', () => {
    const { s, a, b } = setup();
    s.clearSelection();
    s.addColumn();
    const col = s.getState().ui.selection[0];
    s.startDrag('card', b, 0, 0);
    s.moveDrag(40, 40, col);
    s.dropDrag(0);
    expect(s.getState().board.columns[col].cardIds).toEqual([b]);
    s.startDrag('card', a, 0, 0);
    s.moveDrag(40, 40, col, b);
    expect(s.getState().ui.drag!.intoList).toBeNull();
    expect(s.getState().ui.drag!.overColumn).toBe(col);
  });

  it('several selected blocks dragged together never pour', () => {
    const { s, a, b } = setup();
    s.select(a);
    s.pressBlock(b, true);
    s.startDrag('card', a, 0, 0);
    s.moveDrag(40, 40, null, b);
    expect(s.getState().ui.drag!.intoList).toBeNull();
  });
});

describe('dragging items between lists', () => {
  it("a list emptied by dragging out every item goes, and the target is selected; one undo brings it back", () => {
    const { s, a, b, card, texts } = setup();
    const [i1, i2] = card(a)!.items.map((i) => i.id);
    s.selectItemRange(a, i1, i2);
    s.startItemDrag(a, i1, { x: 0, y: 0 });
    s.moveItemDrag({ x: 10, y: 10 }, { cardId: b, drop: { mode: 'append' }, markId: null, markMode: null });
    s.dropItems();
    expect(card(a)).toBeUndefined();
    expect(texts(b)).toEqual(['b1', 'a1', 'a2']);
    expect(s.getState().ui.selection).toEqual([b]);
    s.undo();
    expect(texts(a)).toEqual(['a1', 'a2']);
  });

  it('items dropped on a collapsed list go in at the end, and it stays collapsed', () => {
    const { s, a, b, card, texts } = setup();
    s.toggleCollapsed(b);
    s.startItemDrag(a, card(a)!.items[0].id, { x: 0, y: 0 });
    s.moveItemDrag({ x: 10, y: 10 }, { cardId: b, drop: { mode: 'append' }, markId: null, markMode: null });
    s.dropItems();
    expect(texts(b)).toEqual(['b1', 'a1']);
    expect(card(b)!.collapsed).toBe(true);
  });

  it('items dropped on a collapsed column make a new list at its end', () => {
    const { s, a, card } = setup();
    s.clearSelection();
    s.addColumn();
    const col = s.getState().ui.selection[0];
    s.toggleCollapsed(col);
    s.startItemDrag(a, card(a)!.items[0].id, { x: 0, y: 0 });
    s.moveItemDrag({ x: 10, y: 10 }, { newList: { x: 0, y: 0 }, columnId: col });
    s.dropItems();
    const made = s.getState().board.columns[col].cardIds;
    expect(made).toHaveLength(1);
    expect(displayOrder(card(made[0])!.items)).toHaveLength(1);
    expect(s.getState().board.order).not.toContain(made[0]);
  });
});
