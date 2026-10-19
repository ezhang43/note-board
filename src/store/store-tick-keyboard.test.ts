import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

// Design polish (owner request, 2026-10-19): nothing a key starts is animated, so a tick made from the
// keyboard moves the item to Completed at once. The switch is html[data-input='keys'] (src/main.tsx).

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
  const list = () => s.getState().board.cards[cardId] as TodoCard;
  return { s, cardId, itemId: list().items[0].id, list };
}

describe('ticking an item that goes to Completed', () => {
  it('waits for its fade-out when the pointer did it', () => {
    const { s, cardId, itemId } = setup();
    s.toggleItem(cardId, itemId);
    expect(s.getState().ui.completing).toEqual([itemId]);
    s.flush();
  });

  it('happens at once, with no fade-out, when a key did it', () => {
    input = 'keys';
    const { s, cardId, itemId, list } = setup();
    s.toggleItem(cardId, itemId);
    expect(s.getState().ui.completing).toEqual([]);
    expect(list().items.find((i) => i.id === itemId)?.done).toBe(true);
  });
});
