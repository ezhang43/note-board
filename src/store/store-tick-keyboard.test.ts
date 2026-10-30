import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../model/types';
import { announce, spoken } from './announce';
import { createStore } from './store';

// Ticked items stay in place (owner request, 2026-10-23, job 200): a tick has nowhere to move the item,
// so it happens at once, by pointer or key, with motion allowed or not. Uncheck all and the Completed
// section's open / closed switch are gone.

let input: string | undefined;
beforeEach(() => {
  input = undefined;
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) }); // motion allowed
  vi.stubGlobal('document', { documentElement: { dataset: new Proxy({}, { get: (_t, k) => (k === 'input' ? input : undefined) }) } });
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  s.addCard('todo');
  const cardId = s.getState().ui.selection[0];
  s.setItemText(cardId, (s.getState().board.cards[cardId] as TodoCard).items[0].id, 'first');
  s.itemEnter(cardId, (s.getState().board.cards[cardId] as TodoCard).items[0].id);
  const list = () => s.getState().board.cards[cardId] as TodoCard;
  return { s, cardId, itemId: list().items[0].id, list };
}

describe('ticking an item', () => {
  it('happens at once when the pointer did it, and the item keeps its place', () => {
    const { s, cardId, itemId, list } = setup();
    s.toggleItem(cardId, itemId);
    expect(list().items[0]).toMatchObject({ id: itemId, done: true });
    s.undo();
    expect(list().items[0]).toMatchObject({ id: itemId, done: false });
  });

  it('happens at once when a key did it', () => {
    input = 'keys';
    const { s, cardId, itemId, list } = setup();
    s.toggleItem(cardId, itemId);
    expect(list().items[0]).toMatchObject({ id: itemId, done: true });
  });

  it('Ctrl+Enter (or the phone’s Tick) says which item was ticked or unticked, since the cursor leaves its box', () => {
    const { s, cardId, itemId } = setup();
    announce('');
    s.tickFromKeyboard(cardId, itemId, 0);
    expect(spoken()).toBe('Ticked: first');
    s.tickFromKeyboard(cardId, itemId, 0);
    expect(spoken()).toBe('Unticked: first');
  });

  it('Ctrl+Enter that is refused (an old version being looked at) leaves the cursor where it is', () => {
    const { s, cardId, itemId, list } = setup();
    s.previewVersion({ id: 'v', at: 0 } as never, s.getState().board);
    const focus = s.getState().ui.focusItem;
    s.tickFromKeyboard(cardId, itemId, 0);
    expect(s.getState().ui.focusItem).toBe(focus);
    expect(list().items[0].done).toBe(false);
  });

  it('there is no Uncheck all and no Completed section switch any more', () => {
    const { s } = setup();
    expect('uncheckAll' in s).toBe(false);
    expect('toggleCompletedSection' in s).toBe(false);
    expect('completing' in s.getState().ui).toBe(false);
  });
});
