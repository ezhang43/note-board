import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// Lifting a checklist item by press-and-hold on a phone (job 114): the store keeps how tall the
// lifted rows are and works out how far every other row slides to make room.

/** A store with one list holding "one", "two", "three". */
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

const rows = (ids: string[]) => ({ heights: Object.fromEntries(ids.map((i) => [i, 30])), width: 300 });

describe('lifting an item by press-and-hold', () => {
  it('measures the lifted rows and slides the rows around the drop spot', () => {
    const { s, cardId, first, second, third } = setup();
    s.startItemDrag(cardId, first, { x: 0, y: 0 }, rows);
    expect(s.getState().ui.itemDrag?.lift).toEqual({ heights: { [first]: 30 }, width: 300 });
    // After "three": "two" and "three" slide up into the lifted item's place.
    s.moveItemDrag({ x: 5, y: 5 }, { cardId, drop: { mode: 'after', targetId: third }, markId: third, markMode: 'after' });
    expect(s.getState().ui.itemDrag?.slide).toEqual({ [second]: -30, [third]: -30 });
    // Before "two": the gap is where the item came from, so nothing slides.
    s.moveItemDrag({ x: 5, y: 5 }, { cardId, drop: { mode: 'before', targetId: second }, markId: second, markMode: 'before' });
    expect(s.getState().ui.itemDrag?.slide).toEqual({});
    s.dropItems();
    expect(s.getState().ui.itemDrag).toBeNull();
  });

  it('dropping moves the item with the usual rules', () => {
    const { s, cardId, list, first, third } = setup();
    s.startItemDrag(cardId, first, { x: 0, y: 0 }, rows);
    s.moveItemDrag({ x: 5, y: 5 }, { cardId, drop: { mode: 'after', targetId: third }, markId: third, markMode: 'after' });
    s.dropItems();
    expect(list().items.map((i) => i.text)).toEqual(['two', 'three', 'one']);
    s.undo();
    expect(list().items.map((i) => i.text)).toEqual(['one', 'two', 'three']);
  });

  it('a drag by the grip (not measured) has no slide', () => {
    const { s, cardId, first, third } = setup();
    s.startItemDrag(cardId, first, { x: 0, y: 0 });
    s.moveItemDrag({ x: 5, y: 5 }, { cardId, drop: { mode: 'after', targetId: third }, markId: third, markMode: 'after' });
    expect(s.getState().ui.itemDrag?.lift).toBeUndefined();
    expect(s.getState().ui.itemDrag?.slide).toBeUndefined();
  });

  it('into another list: that list opens a gap and this one closes up; onto the board only this one closes up', () => {
    const { s, cardId, second, third } = setup();
    s.addCard('todo');
    const other = s.getState().ui.selection[0];
    const otherFirst = (s.getState().board.cards[other] as TodoCard).items[0].id;
    s.startItemDrag(cardId, second, { x: 0, y: 0 }, rows);
    s.moveItemDrag({ x: 5, y: 5 }, { cardId: other, drop: { mode: 'before', targetId: otherFirst }, markId: otherFirst, markMode: 'before' });
    expect(s.getState().ui.itemDrag?.slide).toEqual({ [third]: -30, [otherFirst]: 30 });
    s.moveItemDrag({ x: 5, y: 5 }, { newList: { x: 0, y: 0 } });
    expect(s.getState().ui.itemDrag?.slide).toEqual({ [third]: -30 });
  });
});
