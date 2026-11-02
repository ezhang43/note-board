import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flatIds } from '../model/checklist';
import type { TodoCard, TodoItem } from '../model/types';
import { announce, spoken } from './announce';
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

  it('Delete that removes whole items goes the way other item deletes do: the Undo message and the "Deleted…" announcement', () => {
    const { s, id, ids, texts } = setup(['one', 'two', 'three']);
    announce('');
    s.selectWords(id, { id: ids[0], offset: 1 }, { id: ids[2], offset: 2 });
    expect(s.deleteSelectedItems()).toBe(true);
    expect(texts()).toEqual(['oree']);
    expect(s.undoToast()?.text).toBe('Deleted 1 item');
    expect(spoken()).toBe('Deleted 1 item');
  });

  it('Ctrl+X that removes whole items shows the Undo message too', () => {
    const { s, id, ids } = setup(['one', 'two', 'three']);
    s.selectWords(id, { id: ids[0], offset: 0 }, { id: ids[2], offset: 2 });
    expect(s.cutItems()).toBe(true);
    expect(s.undoToast()?.text).toBe('Deleted 2 items');
  });

  it('words taken from inside one item, or joined across two, are like typing: no Undo message', () => {
    const { s, id, ids, texts } = setup(['one', 'two']);
    announce('');
    s.selectWords(id, { id: ids[0], offset: 1 }, { id: ids[1], offset: 2 });
    expect(s.deleteSelectedItems()).toBe(true);
    expect(texts()).toEqual(['oo']);
    expect(s.undoToast()).toBeNull();
    expect(spoken()).toBe('');
  });

  it('from the start of the first item: the last item stays with its own tick (owner decision 2026-11-02)', () => {
    const { s, id, ids, items } = setup(['Buy milk', 'Pay rent']);
    s.toggleItem(id, ids[1]);
    s.selectWords(id, { id: ids[0], offset: 0 }, { id: ids[1], offset: 4 });
    expect(s.deleteSelectedItems()).toBe(true);
    expect(items()).toMatchObject([{ id: ids[1], text: 'rent', done: true }]);
    expect(s.getState().ui).toMatchObject({ focusItem: ids[1], focusOffset: 0 });
  });

  it('an empty highlight and Delete changes nothing and records no undo step', () => {
    const { s, id, ids } = setup(['one', 'two']);
    s.selectWords(id, { id: ids[0], offset: 1 }, { id: ids[1], offset: 1 });
    s.selectWords(id, { id: ids[1], offset: 1 }, { id: ids[1], offset: 1 });
    const before = s.getState().board;
    expect(s.deleteSelectedItems()).toBe(false);
    expect(s.getState().board).toBe(before);
  });

  it('a first item highlighted only from its very end is not touched: ticking leaves it alone', () => {
    const { s, id, ids, items } = setup(['one', 'two', 'three']);
    s.selectWords(id, { id: ids[0], offset: 3 }, { id: ids[1], offset: 2 });
    expect(s.getState().ui.itemSel?.ids).toEqual([ids[1]]);
    // Only a line break highlighted: still a highlight (Delete joins the two), on the first item.
    s.selectWords(id, { id: ids[0], offset: 3 }, { id: ids[1], offset: 0 });
    expect(s.getState().ui.itemSel).toMatchObject({ ids: [ids[0]], words: { focus: { id: ids[1], offset: 0 } } });
    expect(s.deleteSelectedItems()).toBe(true);
    expect(items().map((i) => i.text)).toEqual(['onetwo', 'three']);
  });

  it('Ctrl+C on only a line break keeps what was copied before; Ctrl+X then joins the two as Delete does', () => {
    const { s, id, ids, texts } = setup(['one', 'two', 'three']);
    s.selectWords(id, { id: ids[2], offset: 0 }, { id: ids[2], offset: 5 });
    expect(s.copyItems()).toBe(true);
    s.selectWords(id, { id: ids[0], offset: 3 }, { id: ids[1], offset: 0 });
    expect(s.copyItems()).toBe(false);
    expect(s.cutItems()).toBe(true);
    expect(texts()).toEqual(['onetwo', 'three']);
    expect(s.pasteItemsInto(id, ids[2])).toBe(true);
    expect(texts()).toEqual(['onetwo', 'three', 'three']);
  });

  it("while a container's \"Delete …?\" asks, the highlight's keys leave the list alone", () => {
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1200, height: 800 });
    s.addColumn();
    const col = s.getState().ui.selection[0];
    s.addCard('todo'); // into the selected container
    const id = s.getState().ui.selection[0];
    const item = (s.getState().board.cards[id] as TodoCard).items[0].id;
    s.setItemText(id, item, 'hello');
    vi.advanceTimersByTime(5000);
    s.selectWords(id, { id: item, offset: 1 }, { id: item, offset: 3 });
    s.askDeleteColumn(col);
    expect(s.getState().ui.confirm).not.toBeNull();
    const before = s.getState().board;
    expect(s.deleteSelectedItems()).toBe(false);
    expect(s.deleteWords('X')).toBe(false);
    expect(s.enterOverWords()).toBe(false);
    expect(s.cutItems()).toBe(false);
    expect(s.getState().board).toBe(before);
  });
});
