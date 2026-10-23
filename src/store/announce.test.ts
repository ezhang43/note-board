import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../model/types';
import { announce, announcer, spoken } from './announce';
import { createStore } from './store';

// What a screen reader is told (job 165a): deletes, undo and redo, and items moving to Completed.

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })); // reduced motion
afterEach(() => vi.unstubAllGlobals());

/** A store with one list of the given items, and the text last announced (cleared first). */
function setup(names: string[]) {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  s.addCard('todo');
  const cardId = s.getState().ui.selection[0];
  const list = () => s.getState().board.cards[cardId] as TodoCard;
  let at = list().items[0].id;
  for (const [i, n] of names.entries()) {
    if (i) {
      s.itemEnter(cardId, at);
      at = s.getState().ui.focusItem!;
    }
    s.setItemText(cardId, at, n);
  }
  const id = (n: string) => list().items.find((i) => i.text === n)!.id;
  announce('');
  return { s, cardId, id };
}

describe('the announcer', () => {
  it('says the same message again when it is announced twice in a row', () => {
    announce('Hi');
    const first = announcer.get();
    announce('Hi');
    expect(announcer.get()).not.toBe(first);
    expect(spoken()).toBe('Hi');
  });

  it('tells its listeners, until they stop listening', () => {
    const heard = vi.fn();
    const stop = announcer.subscribe(heard);
    announce('One');
    stop();
    announce('Two');
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe('announcements from the board', () => {
  it('deleting the selected cards says how many', () => {
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1200, height: 800 });
    s.addCard('note');
    s.addCard('note');
    s.selectAll();
    announce('');
    s.deleteSelection();
    expect(spoken()).toBe('Deleted 2 cards');
  });

  it('a card\'s trash can says "Deleted 1 card"', () => {
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1200, height: 800 });
    s.addCard('note');
    const id = s.getState().ui.selection[0];
    announce('');
    s.deleteCard(id);
    expect(spoken()).toBe('Deleted 1 card');
  });

  it('deleting a container says so once it is confirmed, not when it is asked', () => {
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1200, height: 800 });
    s.addColumn();
    const id = s.getState().ui.selection[0];
    s.addCard('note'); // into the selected container: an empty one goes without asking
    announce('');
    s.askDeleteColumn(id);
    expect(spoken()).toBe('');
    s.confirmDelete();
    expect(spoken()).toBe('Deleted 1 container and 1 card');
  });

  it('deleting checklist items says how many', () => {
    const { s, cardId, id } = setup(['a', 'b', 'c']);
    s.trashItem(cardId, id('a'));
    expect(spoken()).toBe('Deleted 1 item');
    announce('');
    s.selectItemRange(cardId, id('b'), id('c'));
    s.deleteSelectedItems();
    expect(spoken()).toBe('Deleted 2 items');
  });

  it('undo and redo say so, and say nothing when there is nothing to undo or redo', () => {
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1200, height: 800 });
    announce('');
    s.undo();
    expect(spoken()).toBe('');
    s.addCard('note');
    s.undo();
    expect(spoken()).toBe('Undid the last change');
    s.redo();
    expect(spoken()).toBe('Redid the last change');
    announce('');
    s.redo();
    expect(spoken()).toBe('');
  });

  it('ticking or unticking one item says nothing: it stays in place and its box says it (job 200)', () => {
    const { s, cardId, id } = setup(['a', 'b']);
    s.toggleItem(cardId, id('a'));
    expect(spoken()).toBe('');
    s.toggleItem(cardId, id('a'));
    expect(spoken()).toBe('');
  });

  it('ticking several items at once says how many', () => {
    const { s, cardId, id } = setup(['a', 'b', 'c']);
    s.selectItemRange(cardId, id('a'), id('b'));
    s.toggleItem(cardId, id('a'));
    expect(spoken()).toBe('Ticked: 2 items');
    announce('');
    s.toggleItem(cardId, id('a'));
    expect(spoken()).toBe('Unticked: 2 items');
  });

  it('Clean up says how many items went to the Completed panel', () => {
    const { s, cardId, id } = setup(['a', 'b']);
    s.toggleItem(cardId, id('a'));
    announce('');
    s.cleanUp();
    expect(spoken()).toBe('1 item moved to the Completed panel');
    announce('');
    s.cleanUp(); // nothing left to move
    expect(spoken()).toBe('');
  });

  it('says nothing when the change was refused, as while an old version is being looked at', () => {
    const { s, cardId, id } = setup(['a', 'b']);
    s.previewVersion({ id: 'v', at: 0 } as never, s.getState().board);
    announce('');
    s.trashItem(cardId, id('a'));
    s.toggleItem(cardId, id('b'));
    s.deleteCard(cardId);
    expect(spoken()).toBe('');
  });

  it('deleting every completed item says so', () => {
    const { s, cardId, id } = setup(['a', 'b']);
    s.toggleItem(cardId, id('a')); // ticked in place (Clean up would move it out of the list)
    announce('');
    s.askDeleteCompleted();
    s.confirmDeleteCompleted();
    expect(spoken()).toBe('Deleted the completed items');
  });
});
