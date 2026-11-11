import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteCard, TodoCard } from '../model/types';
import { createStore } from './store';

// Time estimates on notes and checklist items, and the day an item was ticked (job saved-estimate-doneon).

beforeEach(() => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 23, 30)); // late at night: still the 11th, in local time
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  s.addCard('todo');
  const listId = s.getState().ui.selection[0];
  s.addCard('note');
  const noteId = s.getState().ui.selection[0];
  const list = () => (s.getState().board.cards[listId] as TodoCard).items;
  const note = () => s.getState().board.cards[noteId] as NoteCard;
  return { s, listId, noteId, list, note };
}

describe('setting an estimate', () => {
  it('on an item, then clearing it: each one undo step', () => {
    const { s, listId, list } = setup();
    const id = list()[0].id;
    s.setEstimate(listId, id, 30);
    expect(list()[0].estimate).toBe(30);
    s.setEstimate(listId, id, null);
    expect('estimate' in list()[0]).toBe(false);
    s.undo();
    expect(list()[0].estimate).toBe(30);
    s.undo();
    expect('estimate' in list()[0]).toBe(false);
  });

  it('on a note', () => {
    const { s, noteId, note } = setup();
    s.setEstimate(noteId, null, 90);
    expect(note().estimate).toBe(90);
    s.undo();
    expect('estimate' in note()).toBe(false);
  });

  it('a value that isn’t whole minutes from 1 to 24 hours changes nothing', () => {
    const { s, listId, noteId, list, note } = setup();
    for (const bad of [0, -5, 2.5, 24 * 60 + 1, NaN]) {
      s.setEstimate(listId, list()[0].id, bad);
      s.setEstimate(noteId, null, bad);
    }
    expect('estimate' in list()[0]).toBe(false);
    expect('estimate' in note()).toBe(false);
  });

  it('the same estimate again adds no undo step', () => {
    const { s, noteId, note } = setup();
    s.setEstimate(noteId, null, 15);
    s.setEstimate(noteId, null, 15);
    s.undo();
    expect('estimate' in note()).toBe(false);
  });
});

describe('ticking stamps today', () => {
  it('a ticked item gets today’s date (local time); unticking clears it', () => {
    const { s, listId, list } = setup();
    const id = list()[0].id;
    s.toggleItem(listId, id);
    expect(list()[0]).toMatchObject({ done: true, doneOn: '2026-11-11' });
    s.toggleItem(listId, id);
    expect(list()[0].done).toBe(false);
    expect('doneOn' in list()[0]).toBe(false);
  });
});
