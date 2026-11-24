import { describe, expect, it } from 'vitest';
import { isGestureBusy } from './gestureBusy';
import { createStore } from './store';

describe('isGestureBusy', () => {
  it('is false when no pointer gesture is active', () => {
    const store = createStore(null, (fn) => fn());
    expect(isGestureBusy(store)).toBe(false);
  });

  it('is true during a block drag and false once canceled', () => {
    const store = createStore(null, (fn) => fn());
    store.addCard('note');
    const id = store.getState().board.order[0];
    const card = store.getState().board.cards[id];
    store.startDrag('card', id, card.x, card.y);
    expect(isGestureBusy(store)).toBe(true);
    store.cancelDrag();
    expect(isGestureBusy(store)).toBe(false);
  });

  it('is true during a resize and false once canceled', () => {
    const store = createStore(null, (fn) => fn());
    store.addCard('note');
    const id = store.getState().board.order[0];
    store.showResize({ kind: 'card', id, w: 300, h: 200, liveW: 300, liveH: 200, matchIds: [], label: '300 × 200', labelAt: { x: 0, y: 0 } });
    expect(isGestureBusy(store)).toBe(true);
    store.cancelResize();
    expect(isGestureBusy(store)).toBe(false);
  });

  it('is true during a new-block drag and false once canceled', () => {
    const store = createStore(null, (fn) => fn());
    store.startNewDrag('note');
    expect(isGestureBusy(store)).toBe(true);
    store.cancelNewDrag();
    expect(isGestureBusy(store)).toBe(false);
  });

  it('is true during a checklist item drag and false once canceled', () => {
    const store = createStore(null, (fn) => fn());
    store.addCard('todo');
    const id = store.getState().board.order[0];
    const card = store.getState().board.cards[id];
    if (card.kind !== 'todo') throw new Error('expected todo card');
    store.startItemDrag(id, card.items[0].id, { x: 0, y: 0 });
    expect(isGestureBusy(store)).toBe(true);
    store.cancelItemDrag();
    expect(isGestureBusy(store)).toBe(false);
  });
});
