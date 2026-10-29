import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

// Delete with the cursor in a ticked item (owner report 2026-10-29, job 218): the item goes, like
// its trash can, never the card; an open item is left to the usual Delete.

beforeEach(() => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('document', { documentElement: { dataset: {} } });
});
afterEach(() => vi.unstubAllGlobals());

function setup(texts: string[]) {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  s.addCard('todo');
  const cardId = s.getState().ui.selection[0];
  const list = () => s.getState().board.cards[cardId] as TodoCard;
  texts.forEach((t, i) => {
    if (i) s.itemEnter(cardId, list().items[i - 1].id);
    s.setItemText(cardId, list().items[i].id, t);
  });
  const id = (text: string) => list().items.find((it) => it.text === text)!.id;
  return { s, cardId, list, id };
}

describe('deleteTickedItem', () => {
  it('removes a ticked item with its sub-items in one undo step; the cursor goes to the item above', () => {
    const { s, cardId, list, id } = setup(['bread', 'milk', 'oat', 'eggs']);
    s.itemTab(cardId, id('oat'), false); // oat under milk
    s.toggleItem(cardId, id('milk'));
    expect(s.deleteTickedItem(cardId, id('milk'))).toBe(true);
    expect(list().items.map((it) => it.text)).toEqual(['bread', 'eggs']);
    expect(s.getState().board.cards[cardId]).toBeDefined();
    expect(s.getState().ui.focusItem).toBe(id('bread'));
    s.undo();
    expect(list().items.map((it) => it.text)).toEqual(['bread', 'milk', 'eggs']);
    expect(list().items[1]).toMatchObject({ done: true, children: [{ text: 'oat' }] });
  });

  it('leaves an open item alone and says so', () => {
    const { s, cardId, list, id } = setup(['bread', 'milk']);
    expect(s.deleteTickedItem(cardId, id('milk'))).toBe(false);
    expect(list().items.map((it) => it.text)).toEqual(['bread', 'milk']);
  });

  it('the last item of a list leaves one blank item, and the card stays', () => {
    const { s, cardId, list, id } = setup(['bread']);
    s.toggleItem(cardId, id('bread'));
    expect(s.deleteTickedItem(cardId, id('bread'))).toBe(true);
    expect(list().items).toMatchObject([{ text: '', done: false }]);
    expect(s.getState().ui.focusItem).toBe(list().items[0].id);
  });
});
