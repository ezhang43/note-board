import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard, TodoItem } from '../model/types';
import { createStore } from './store';

// Owner request 2026-11-10 ("yes re-tick"): removing a blank sub-item re-ticks its parent, in the same undo step.

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) }));
afterEach(() => vi.unstubAllGlobals());

const outline = (items: TodoItem[]): string => items.map((i) => `${i.done ? '+' : ''}${i.text || '_'}${i.children.length ? `(${outline(i.children)})` : ''}`).join(' ');

describe('Backspace on a blank sub-item under a ticked parent', () => {
  it('re-ticks the parent, and one undo brings back the blank item and the unticked parent', () => {
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1200, height: 800 });
    s.addCard('todo');
    const cardId = s.getState().ui.selection[0];
    const list = () => (s.getState().board.cards[cardId] as TodoCard).items;
    const p = list()[0].id;
    s.setItemText(cardId, p, 'parent');
    s.itemEnter(cardId, p);
    const a = s.getState().ui.focusItem!;
    s.setItemText(cardId, a, 'a');
    s.itemTab(cardId, a, false);
    s.toggleItem(cardId, a); // the last sub-item ticks the parent
    expect(outline(list())).toBe('+parent(+a)');
    s.itemEnter(cardId, a); // a blank sub-item: the parent unticks
    const blank = s.getState().ui.focusItem!;
    expect(outline(list())).toBe('parent(+a _)');
    expect(s.itemBackspace(cardId, blank)).toBe(true);
    expect(outline(list())).toBe('+parent(+a)');
    s.undo();
    expect(outline(list())).toBe('parent(+a _)');
  });
});
