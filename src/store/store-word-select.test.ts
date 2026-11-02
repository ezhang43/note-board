import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flatIds } from '../model/checklist';
import type { TodoCard, TodoItem } from '../model/types';
import { createStore } from './store';

// Word-style highlights across checklist items (owner request, 2026-11-01): the store's side.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(lines: string[]) {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  s.addCard('todo');
  const id = s.getState().ui.selection[0];
  let item = (s.getState().board.cards[id] as TodoCard).items[0].id;
  lines.forEach((t, i) => {
    if (i) {
      s.itemEnter(id, item);
      item = s.getState().ui.focusItem!;
    }
    s.setItemText(id, item, t);
  });
  vi.advanceTimersByTime(5000); // the typing above is its own undo steps
  const items = () => (s.getState().board.cards[id] as TodoCard).items;
  const ids = flatIds(items());
  const texts = () => items().flatMap(function walk(it): TodoItem[] { return [it, ...it.children.flatMap(walk)]; }).map((it) => it.text);
  return { s, id, ids, items, texts };
}

describe('a word highlight across items', () => {
  it('selects the items it touches, for ticking, the trash and the grip', () => {
    const { s, id, ids } = setup(['one', 'two', 'three']);
    s.selectWords(id, { id: ids[0], offset: 1 }, { id: ids[2], offset: 2 });
    expect(s.getState().ui.itemSel).toMatchObject({ cardId: id, ids, words: { anchor: { id: ids[0], offset: 1 }, focus: { id: ids[2], offset: 2 } } });
    s.toggleItem(id, ids[1]);
    expect(s.getState().board.cards[id]).toMatchObject({ items: ids.map(() => ({ done: true })) });
  });

  it('Delete removes just the words and joins the first and last items; one undo brings it all back', () => {
    const { s, id, ids, texts } = setup(['one', 'two', 'three']);
    s.selectWords(id, { id: ids[0], offset: 1 }, { id: ids[2], offset: 2 });
    expect(s.deleteSelectedItems()).toBe(true);
    expect(texts()).toEqual(['oree']);
    expect(s.getState().ui).toMatchObject({ itemSel: null, focusItem: ids[0], focusOffset: 1 });
    s.undo();
    expect(texts()).toEqual(['one', 'two', 'three']);
  });

  it('a typed letter replaces the highlight', () => {
    const { s, id, ids, texts } = setup(['one', 'two']);
    s.selectWords(id, { id: ids[1], offset: 1 }, { id: ids[0], offset: 2 });
    expect(s.deleteWords('X')).toBe(true);
    expect(texts()).toEqual(['onXwo']);
    expect(s.getState().ui).toMatchObject({ focusItem: ids[0], focusOffset: 3 });
    s.undo();
    expect(texts()).toEqual(['one', 'two']);
  });

  it('Enter replaces the highlight with a split, as one undo step', () => {
    const { s, id, ids, texts } = setup(['one', 'two', 'three']);
    s.selectWords(id, { id: ids[0], offset: 2 }, { id: ids[2], offset: 2 });
    expect(s.enterOverWords()).toBe(true);
    expect(texts()).toEqual(['on', 'ree']);
    s.undo();
    expect(texts()).toEqual(['one', 'two', 'three']);
  });

  it('copy takes exactly the highlighted words and pastes them as items; cut removes them as Delete does', () => {
    const { s, id, ids, texts } = setup(['one', 'two', 'three']);
    s.selectWords(id, { id: ids[0], offset: 1 }, { id: ids[2], offset: 2 });
    expect(s.copyItems()).toBe(true);
    s.clearItemSelection();
    expect(s.pasteItemsInto(id, ids[2])).toBe(true);
    expect(texts()).toEqual(['one', 'two', 'three', 'ne', 'two', 'th']);
    s.undo();
    s.selectWords(id, { id: ids[0], offset: 1 }, { id: ids[2], offset: 2 });
    expect(s.cutItems()).toBe(true);
    expect(texts()).toEqual(['oree']);
    s.undo();
    expect(texts()).toEqual(['one', 'two', 'three']);
  });

  it('Shift+click extends the highlight from where it started, or from the cursor in the item being typed in', () => {
    const { s, id, ids } = setup(['one', 'two', 'three']);
    expect(s.extendWords(id, { id: ids[2], offset: 1 })).toBe(false); // nothing to extend from
    expect(s.extendWords(id, { id: ids[2], offset: 1 }, { id: ids[0], offset: 2 })).toBe(true);
    expect(s.getState().ui.itemSel?.words).toEqual({ anchor: { id: ids[0], offset: 2 }, focus: { id: ids[2], offset: 1 } });
    s.extendWords(id, { id: ids[1], offset: 0 });
    expect(s.getState().ui.itemSel).toMatchObject({ ids: [ids[0]], words: { anchor: { id: ids[0], offset: 2 }, focus: { id: ids[1], offset: 0 } } });
  });
});
