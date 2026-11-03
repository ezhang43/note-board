import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard, TodoItem } from '../model/types';
import { createStore } from './store';

// Owner report 2026-11-03: a fully ticked list, then an open sub-item added under it, must untick the
// parent. Through the store: each way of adding an item is one undo step that unticks and adds together.

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) }));
afterEach(() => vi.unstubAllGlobals());

const outline = (items: TodoItem[]): string => items.map((i) => `${i.done ? '+' : ''}${i.text || '_'}${i.children.length ? `(${outline(i.children)})` : ''}`).join(' ');

/** One list: parent "p" with sub-items "a" and "b", all ticked (ticking the last sub-item ticks the parent). */
function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  s.addCard('todo');
  const cardId = s.getState().ui.selection[0];
  const items = () => (s.getState().board.cards[cardId] as TodoCard).items;
  const p = items()[0].id;
  s.setItemText(cardId, p, 'p');
  s.itemEnter(cardId, p);
  const a = s.getState().ui.focusItem!;
  s.setItemText(cardId, a, 'a');
  s.itemEnter(cardId, a);
  const b = s.getState().ui.focusItem!;
  s.setItemText(cardId, b, 'b');
  s.itemTab(cardId, a, false);
  s.itemTab(cardId, b, false);
  s.toggleItem(cardId, a);
  s.toggleItem(cardId, b);
  return { s, cardId, items, p, a, b };
}

describe('a fully ticked list gets an open sub-item', () => {
  it('starts all ticked', () => {
    expect(outline(setup().items())).toBe('+p(+a +b)');
  });

  it('Enter at the end of the last sub-item unticks the parent, and Undo restores both in one step', () => {
    const { s, cardId, items, b } = setup();
    s.itemEnter(cardId, b);
    expect(outline(items())).toBe('p(+a +b _)');
    expect(s.getState().ui.focusItem).toBe(items()[0].children[2].id);
    s.undo();
    expect(outline(items())).toBe('+p(+a +b)');
    s.redo();
    expect(outline(items())).toBe('p(+a +b _)');
  });

  it('Enter at the end of the ticked parent (new first sub-item), or at the start of a ticked sub-item, does the same', () => {
    const one = setup();
    one.s.itemEnter(one.cardId, one.p);
    expect(outline(one.items())).toBe('p(_ +a +b)');
    const two = setup();
    two.s.itemEnter(two.cardId, two.a, 0, 0);
    expect(outline(two.items())).toBe('p(_ +a +b)');
  });

  it('the word-highlight split (Enter over words) in a ticked sub-item unticks the parent in the same step', () => {
    const { s, cardId, items, a } = setup();
    s.setItemText(cardId, a, 'hello world');
    s.toggleItem(cardId, a);
    s.toggleItem(cardId, a); // untick then tick again: a, b and p are all ticked
    expect(outline(items())).toBe('+p(+hello world +b)');
    s.selectWords(cardId, { id: a, offset: 5 }, { id: a, offset: 11 });
    expect(s.enterOverWords()).toBe(true);
    expect(outline(items())).toBe('p(+hello _ +b)');
    s.undo();
    expect(outline(items())).toBe('+p(+hello world +b)');
  });

  it('pasting open items after a ticked sub-item (Ctrl+V of copied items, and of Journal lines) unticks the parent', () => {
    const { s, cardId, items, b } = setup();
    s.addCard('todo');
    const otherId = s.getState().ui.selection[0];
    const other = () => (s.getState().board.cards[otherId] as TodoCard).items;
    s.setItemText(otherId, other()[0].id, 'x');
    s.selectItemRange(otherId, other()[0].id, other()[0].id);
    expect(s.copyItems()).toBe(true);
    expect(s.pasteItemsInto(cardId, b)).toBe(true);
    expect(outline(items())).toBe('p(+a +b x)');
    s.undo();
    expect(outline(items())).toBe('+p(+a +b)');
    const line = JSON.stringify([{ type: 'bullet', runs: [{ text: 'y' }] }]);
    expect(s.pasteJournalInto(cardId, b, line)).toBe(true);
    expect(outline(items())).toBe('p(+a +b y)');
    s.undo();
    expect(outline(items())).toBe('+p(+a +b)');
  });

  it('pasting with items selected (pasteItems) unticks the parent too', () => {
    const { s, cardId, items, b } = setup();
    s.addCard('todo');
    const otherId = s.getState().ui.selection[0];
    const first = (s.getState().board.cards[otherId] as TodoCard).items[0].id;
    s.setItemText(otherId, first, 'x');
    s.selectItemRange(otherId, first, first);
    expect(s.copyItems()).toBe(true);
    s.selectItemRange(cardId, b, b);
    expect(s.pasteItems()).toBe(true);
    expect(outline(items())).toBe('p(+a +b x)');
    s.undo();
    expect(outline(items())).toBe('+p(+a +b)');
  });

  it('ticking the last open sub-item still ticks the parent', () => {
    const { s, cardId, items, b } = setup();
    s.itemEnter(cardId, b);
    const fresh = s.getState().ui.focusItem!;
    s.setItemText(cardId, fresh, 'c');
    expect(outline(items())).toBe('p(+a +b c)');
    s.toggleItem(cardId, fresh);
    expect(outline(items())).toBe('+p(+a +b +c)');
  });
});
