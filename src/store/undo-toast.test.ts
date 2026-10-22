import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { habitList } from '../model/habits';
import type { TodoCard } from '../model/types';
import { spoken } from './announce';
import { createStore } from './store';

// The Undo message after a delete (job 170, owner 2026-10-22): it says what went, and its Undo button
// undoes exactly that delete, so it goes as soon as anything else changes.

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) }));
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}
const board = (s: ReturnType<typeof setup>) => s.getState().board;

describe('the Undo message', () => {
  it('shows after deleting a card, and Undo brings the card back', () => {
    const s = setup();
    s.addCard('note');
    const id = s.getState().ui.selection[0];
    expect(s.undoToast()).toBeNull();
    s.deleteSelection();
    expect(s.undoToast()?.text).toBe('Deleted 1 card');
    expect(board(s).cards[id]).toBeUndefined();
    s.undoDelete();
    expect(board(s).cards[id]).toBeDefined();
    expect(s.undoToast()).toBeNull();
    expect(spoken()).toBe('Undid the last change');
  });

  it('says how many went when several are deleted', () => {
    const s = setup();
    s.addCard('note');
    s.addCard('note');
    s.selectAll();
    s.deleteSelection();
    expect(s.undoToast()?.text).toBe('Deleted 2 cards');
  });

  it('goes as soon as anything else changes, so Undo never undoes something else', () => {
    const s = setup();
    s.addCard('note');
    const keep = s.getState().ui.selection[0];
    s.addCard('note');
    s.deleteSelection();
    expect(s.undoToast()).not.toBeNull();
    s.setNoteText(keep, 'typed after');
    expect(s.undoToast()).toBeNull();
    s.undoDelete(); // nothing: the message has gone
    expect((board(s).cards[keep] as { text: string }).text).toBe('typed after');
    expect(Object.keys(board(s).cards)).toHaveLength(1);
  });

  it('goes after Ctrl+Z too', () => {
    const s = setup();
    s.addCard('note');
    s.deleteSelection();
    s.undo();
    expect(s.undoToast()).toBeNull();
    expect(Object.keys(board(s).cards)).toHaveLength(1);
  });

  it('an empty container is deleted at once, with the Undo message; one with cards still asks', () => {
    const s = setup();
    s.addColumn();
    const empty = s.getState().ui.selection[0];
    s.askDeleteColumn(empty);
    expect(s.getState().ui.confirm).toBeNull();
    expect(board(s).columns[empty]).toBeUndefined();
    expect(s.undoToast()?.text).toBe('Deleted 1 container');
    s.undoDelete();
    expect(board(s).columns[empty]).toBeDefined();

    // With the Delete key too.
    s.select(empty);
    s.deleteSelection();
    expect(s.getState().ui.confirm).toBeNull();
    expect(board(s).columns[empty]).toBeUndefined();
    s.undoDelete();

    s.select(empty);
    s.addCard('note'); // goes into the selected container
    s.askDeleteColumn(empty);
    expect(s.getState().ui.confirm).toEqual({ columnId: empty, ids: [empty] });
    s.confirmDelete();
    expect(board(s).columns[empty]).toBeUndefined();
    expect(s.undoToast()?.text).toBe('Deleted 1 container and 1 card');
    s.undoDelete();
    expect(board(s).columns[empty].cardIds).toHaveLength(1);
  });

  it('shows after deleting checklist items and the completed items', () => {
    const s = setup();
    s.addCard('todo');
    const cardId = s.getState().ui.selection[0];
    const item = (board(s).cards[cardId] as TodoCard).items[0].id;
    s.trashItem(cardId, item);
    expect(s.undoToast()?.text).toBe('Deleted 1 item');
    s.undoDelete();
    expect((board(s).cards[cardId] as TodoCard).items.map((i) => i.id)).toContain(item);
  });

  it('a delete that changed nothing shows no message, so Undo can never undo something earlier', () => {
    const s = setup();
    s.addCard('note'); // the earlier change
    s.confirmDeleteCompleted(); // nothing completed: nothing goes
    expect(s.undoToast()).toBeNull();
  });

  it('counts the cards that go with a container', () => {
    const s = setup();
    s.addColumn();
    const col = s.getState().ui.selection[0];
    s.addCard('note');
    s.select(col);
    s.addCard('note');
    s.askDeleteColumn(col);
    s.confirmDelete();
    expect(s.undoToast()?.text).toBe('Deleted 1 container and 2 cards');
  });

  it('goes when another board is opened', () => {
    const s = setup();
    s.addCard('note');
    s.deleteSelection();
    s.newBoard();
    expect(s.undoToast()).toBeNull();
  });

  it('deleting a habit shows it, and Undo brings the habit back on the Habits board, leaving the open board alone', () => {
    const s = setup();
    s.addCard('note');
    s.openHabits();
    s.addHabit('Walk');
    const habits = () => habitList(s.workspace().boards[s.habitsBoard()!]);
    s.deleteHabit(habits()[0].id);
    expect(habits()).toHaveLength(0);
    expect(s.undoToast()?.text).toBe('Deleted the habit “Walk”');
    s.undoDelete();
    expect(habits().map((h) => h.title)).toEqual(['Walk']);
    expect(Object.keys(board(s).cards)).toHaveLength(1);
  });
});
