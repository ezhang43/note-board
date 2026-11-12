import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completedCardOf } from '../model/completed';
import { CHECKLIST_NAME, checklistCardOf } from '../model/mainChecklist';
import type { StorageLike } from '../model/persist';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

// The main checklist (owner request, 2026-11-12): a Checklist panel on the left, open beside any
// right-hand panel, that keeps one checklist on a hidden board called "Main checklist" without opening it.

const memoryStorage = (): StorageLike => {
  const data: Record<string, string> = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
};
const later = (fn: () => void) => fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 12, 10, 0));
});
afterEach(() => vi.useRealTimers());

type Store = ReturnType<typeof setup>;
function setup(storage = memoryStorage()) {
  const s = createStore(storage, later);
  s.setViewportSize({ width: 1000, height: 800 });
  return s;
}
const checklistIds = (s: Store) => Object.entries(s.workspace().boards).filter(([, b]) => b.name === CHECKLIST_NAME).map(([id]) => id);
/** The panel's board, its store and its checklist. */
function panel(s: Store) {
  const id = s.checklistBoard()!;
  const p = s.storeFor(id);
  const list = () => checklistCardOf(s.workspace().boards[id])!;
  return { id, p, list };
}

describe('Checklist panel', () => {
  it('opens on the left, beside a right-hand panel, making its board once', () => {
    const s = setup();
    expect(s.checklistBoard()).toBeNull();
    s.openJournal();
    expect(s.openChecklist()).toBeNull();
    expect(s.getState().ui.checklistOpen).toBe(true);
    expect(s.getState().ui.sidePanel).toBe('journal'); // both open
    expect(checklistIds(s)).toHaveLength(1);
    const { list } = panel(s);
    expect(list().title).toBe('Checklist');
    // Not an undo step on any board, and the open board is unchanged.
    expect(s.getState().ui.canUndo).toBe(false);
    s.openChecklist(); // closes
    expect(s.getState().ui.checklistOpen).toBe(false);
    s.openChecklist();
    expect(checklistIds(s)).toHaveLength(1);
  });

  it('on a phone it takes the screen: the right-hand panel closes', () => {
    const s = setup();
    s.openJournal();
    s.openChecklist(true);
    expect(s.getState().ui.checklistOpen).toBe(true);
    expect(s.getState().ui.sidePanel).toBeNull();
  });

  it('is hidden from the Boards menu, and is still there after a reload', () => {
    const storage = memoryStorage();
    const s = setup(storage);
    s.openChecklist();
    const { id, p, list } = panel(s);
    p.setItemText(list().id, list().items[0].id, 'buy milk');
    expect(s.hiddenBoards()).toContain(id);
    s.flush();
    const again = setup(storage);
    expect(again.checklistBoard()).toBe(id);
    expect(checklistCardOf(again.workspace().boards[id])!.items[0].text).toBe('buy milk');
    expect(again.hiddenBoards()).toContain(id);
  });

  it('changes go to the checklist board alone, on its own undo, whichever board is open', () => {
    const s = setup();
    s.addCard('note');
    const open = s.getState().board;
    s.openChecklist();
    const { p, list } = panel(s);
    const item = list().items[0].id;
    p.setItemText(list().id, item, 'call the bank');
    p.itemEnter(list().id, item);
    expect(list().items).toHaveLength(2);
    expect(s.getState().board).toBe(open); // the open board is untouched
    // Ctrl+Z on the board undoes the board's own change (the note), not the checklist.
    s.undo();
    expect(Object.keys(s.getState().board.cards)).toHaveLength(0);
    expect(list().items).toHaveLength(2);
    // Ctrl+Z in the panel steps back on the checklist alone.
    s.undoChecklist();
    expect(list().items).toHaveLength(1);
    s.undoChecklist();
    expect(list().items[0].text).toBe('');
    s.redoChecklist();
    expect(list().items[0].text).toBe('call the bank');
  });

  it('a delete in the panel never reaches what is selected on the board', () => {
    const s = setup();
    s.addCard('note');
    const note = Object.keys(s.getState().board.cards)[0];
    s.select(note);
    s.openChecklist();
    const { p, list } = panel(s);
    s.select(note); // still selected behind the panel
    expect(p.deleteSelection()).toBe(false);
    p.itemBackspace(list().id, list().items[0].id);
    expect(s.getState().board.cards[note]).toBeDefined();
    expect(list()).not.toBeNull(); // the panel's list is never deleted
    p.select(list().id); // a press on its row selects it, as on the board
    expect(p.deleteSelection()).toBe(false);
    p.deleteCard(list().id);
    expect(list()).not.toBeNull();
  });

  it('ticked items clean up into the checklist board’s own Completed record, and come back', () => {
    const s = setup();
    s.openChecklist();
    const { id, p, list } = panel(s);
    const card = list().id;
    const item = list().items[0].id;
    p.setItemText(card, item, 'water plants');
    p.toggleItem(card, item);
    expect(p.cleanUpList(card)).toBe(1);
    const board = () => s.workspace().boards[id];
    expect(completedCardOf(board())!.groups[0].entries[0].item.text).toBe('water plants');
    expect(list().items.map((i) => i.text)).toEqual(['']);
    expect(s.hiddenBoards()).toContain(id); // still hidden with the record on it
    expect(completedCardOf(s.getState().board)).toBeNull(); // nothing on the open board
    // Unticking it in the Completed panel puts it back in the same list (not a new one).
    p.restoreCompleted(completedCardOf(board())!.groups[0].entries[0].item.id);
    expect(Object.values(board().cards).filter((c) => c.kind === 'todo')).toHaveLength(1);
    expect(list().items.map((i) => i.text)).toContain('water plants');
    s.undoChecklist();
    expect(list().items.map((i) => i.text)).not.toContain('water plants');
  });

  it('items copied in the panel paste on the board, and back', () => {
    const s = setup();
    s.addCard('todo');
    const boardList = Object.values(s.getState().board.cards)[0] as TodoCard;
    s.openChecklist();
    const { p, list } = panel(s);
    p.setItemText(list().id, list().items[0].id, 'from the panel');
    p.selectItemRange(list().id, list().items[0].id, list().items[0].id);
    expect(p.copyItems()).toBe(true);
    s.selectItemRange(boardList.id, boardList.items[0].id, boardList.items[0].id);
    expect(s.pasteItems()).toBe(true);
    expect((s.getState().board.cards[boardList.id] as TodoCard).items.map((i) => i.text)).toContain('from the panel');
    expect(list().items.map((i) => i.text)).toEqual(['from the panel']); // the panel's list unchanged
  });

  it('a restored version rolls the checklist back with every other board', () => {
    const s = setup();
    s.openChecklist();
    const { id, p, list } = panel(s);
    const before = s.workspace();
    p.setItemText(list().id, list().items[0].id, 'later');
    s.restoreVersion(before);
    expect(checklistCardOf(s.workspace().boards[id])!.items[0].text).toBe('');
  });

  it('while its board is the open one, the panel changes that board as usual', () => {
    const s = setup();
    s.openChecklist();
    const { id } = panel(s);
    s.openBoard(id);
    const p = s.storeFor(id);
    const list = checklistCardOf(s.getState().board)!;
    p.setItemText(list.id, list.items[0].id, 'here');
    expect(checklistCardOf(s.getState().board)!.items[0].text).toBe('here');
    expect(checklistIds(s)).toHaveLength(1);
  });
});
