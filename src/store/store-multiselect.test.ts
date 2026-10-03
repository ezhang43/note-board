import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A column with two lists ("one", "two" / "three"), and a loose list ("four"). */
function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  s.addColumn();
  const col = s.getState().ui.selection[0];
  const listIn = (texts: string[]) => {
    s.select(col);
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
  const a = listIn(['one', 'two']);
  const b = listIn(['three']);
  s.clearSelection();
  s.addCard('todo');
  const loose = s.getState().ui.selection[0];
  const looseItem = (s.getState().board.cards[loose] as TodoCard).items[0].id;
  s.setItemText(loose, looseItem, 'four');
  const items = (id: string) => (s.getState().board.cards[id] as TodoCard).items;
  return { s, col, a, b, loose, items };
}

const picked = (s: ReturnType<typeof setup>['s']) => {
  const sel = s.getState().ui.itemSel;
  return sel?.lists ? sel.lists.map((l) => l.ids.length) : sel ? [sel.ids.length] : [];
};

describe('the Ctrl+A ladder (owner request)', () => {
  it('whole list, then the lists in the column, then the whole board', () => {
    const { s, a } = setup();
    s.selectWholeList(a);
    expect(picked(s)).toEqual([2]);
    s.selectAllStep();
    expect(picked(s)).toEqual([2, 1]);
    s.selectAllStep();
    expect(picked(s)).toEqual([2, 1, 1]);
    s.selectAllStep(); // stays at the whole board
    expect(picked(s)).toEqual([2, 1, 1]);
    s.clearItemSelection();
    expect(s.getState().ui.itemSel).toBeNull();
  });

  it('a loose list goes straight from the whole list to the whole board', () => {
    const { s, loose } = setup();
    s.selectWholeList(loose);
    s.selectAllStep();
    expect(picked(s)).toEqual([2, 1, 1]);
  });
});

describe('items selected in several lists', () => {
  it('Delete removes them from every list; ticking one ticks them all; one undo step each', () => {
    const { s, a, b, items } = setup();
    s.selectWholeList(a);
    s.selectAllStep(); // both lists in the column
    s.toggleItem(a, items(a)[0].id);
    expect(items(a).every((i) => i.done) && items(b).every((i) => i.done)).toBe(true);
    s.undo();
    expect(items(b)[0].done).toBe(false);
    s.selectWholeList(a);
    s.selectAllStep();
    expect(s.deleteSelectedItems()).toBe(true);
    expect(items(a).map((i) => i.text)).toEqual(['']);
    expect(items(b).map((i) => i.text)).toEqual(['']);
  });

  it('dragging from one list into the next card of the column selects across them', () => {
    const { s, col, a, b, items } = setup();
    s.selectAcross(col, { cardId: a, itemId: items(a)[1].id }, { cardId: b, itemId: items(b)[0].id });
    expect(picked(s)).toEqual([1, 1]);
  });

  it('Tab does nothing across several lists', () => {
    const { s, a, items } = setup();
    s.selectWholeList(a);
    s.selectAllStep();
    const before = items(a);
    s.tabSelectedItems(false);
    expect(items(a)).toEqual(before);
  });
});

describe('Ctrl+A from some of a list\'s items', () => {
  it('takes the whole list first, then carries on up the ladder', () => {
    const { s, a, items } = setup();
    s.selectItemRange(a, items(a)[0].id, items(a)[0].id);
    expect(picked(s)).toEqual([1]);
    s.selectAllStep();
    expect(picked(s)).toEqual([2]);
    s.selectAllStep();
    expect(picked(s)).toEqual([2, 1]);
  });
});
