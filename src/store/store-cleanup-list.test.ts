import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completedCardOf } from '../model/completed';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

// Clean up on one list (owner request, 2026-10-05): the button beside Uncheck all.

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) }));
afterEach(() => vi.unstubAllGlobals());

/** A store with two checklists, each holding "a" (ticked) and "b". */
function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  const ids: string[] = [];
  for (let n = 0; n < 2; n++) {
    s.addCard('todo');
    const cardId = s.getState().ui.selection[0];
    const list = () => s.getState().board.cards[cardId] as TodoCard;
    const first = list().items[0].id;
    s.setItemText(cardId, first, 'a');
    s.itemEnter(cardId, first);
    s.setItemText(cardId, s.getState().ui.focusItem!, 'b');
    s.toggleItem(cardId, first);
    ids.push(cardId);
  }
  const texts = (id: string) => (s.getState().board.cards[id] as TodoCard).items.map((i) => `${i.done ? '+' : ''}${i.text}`).join(' ');
  return { s, one: ids[0], two: ids[1], texts };
}

describe('Clean up on one list', () => {
  it('moves only that list’s ticked items into the Completed card', () => {
    const { s, one, two, texts } = setup();
    expect(s.cleanUpList(one)).toBe(1);
    expect(texts(one)).toBe('b');
    expect(texts(two)).toBe('+a b');
    const done = completedCardOf(s.getState().board)!;
    expect(done.groups[0].entries.map((e) => [e.item.text, e.fromCardId])).toEqual([['a', one]]);
  });

  it('is one undo step', () => {
    const { s, one, texts } = setup();
    s.cleanUpList(one);
    s.undo();
    expect(texts(one)).toBe('+a b');
    expect(completedCardOf(s.getState().board)).toBeNull();
  });

  it('does nothing on a list with nothing ticked', () => {
    const { s, one } = setup();
    s.cleanUpList(one);
    expect(s.cleanUpList(one)).toBe(0);
  });
});
