import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_KEY, serializeBoard, type StorageLike } from '../model/persist';
import { createBoard } from '../model/board';
import { OPEN_BOARD_KEY, readWorkspace, serializeWorkspace } from '../model/workspace';
import { BOARD_SAVE_DELAY, createStore } from './store';

// Several boards, and boards inside boards (owner request, 2026-10-05).

function memoryStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const later = (fn: () => void) => fn();

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const storage = memoryStorage();
  const s = createStore(storage, later);
  s.setViewportSize({ width: 1000, height: 800 });
  return { storage, s };
}

const saved = (storage: { data: Record<string, string> }) => {
  vi.advanceTimersByTime(BOARD_SAVE_DELAY);
  return readWorkspace(storage.data[BOARD_KEY])!.ws;
};

describe('several boards', () => {
  it('New board opens a fresh, unnamed board; the first board is kept; both are saved', () => {
    const { storage, s } = setup();
    s.renameBoard('Home');
    s.addCard('note');
    const home = s.getState().boards.open;
    const id = s.newBoard();
    expect(s.getState().boards.open).toBe(id);
    expect(s.getState().board).toMatchObject({ name: '', order: [] });
    s.renameBoard('Recipes');
    const ws = saved(storage);
    expect(ws.home).toBe(home);
    expect(ws.boards[home].name).toBe('Home');
    expect(ws.boards[home].order).toHaveLength(1);
    expect(ws.boards[id].name).toBe('Recipes');
  });

  it('switching boards shows the other board and remembers which is open on this device only', () => {
    const { storage, s } = setup();
    const home = s.getState().boards.open;
    const id = s.newBoard();
    s.renameBoard('Second');
    s.openBoard(home);
    expect(s.getState().board.name).not.toBe('Second');
    vi.advanceTimersByTime(BOARD_SAVE_DELAY);
    expect(storage.data[OPEN_BOARD_KEY]).toBe(home);
    s.openBoard(id);
    vi.advanceTimersByTime(BOARD_SAVE_DELAY);
    // The open board isn't part of the saved (synced) boards.
    expect(storage.data[BOARD_KEY]).not.toContain('"open"');
    expect(createStore(storage, later).getState().board.name).toBe('Second');
  });

  it('undo belongs to each board: switching away and back keeps it, and never undoes across boards', () => {
    const { s } = setup();
    const home = s.getState().boards.open;
    s.renameBoard('Home');
    const id = s.newBoard();
    expect(s.getState().ui.canUndo).toBe(false);
    s.renameBoard('Other');
    s.openBoard(home);
    expect(s.getState().ui.canUndo).toBe(true);
    s.undo();
    expect(s.getState().board.name).not.toBe('Home');
    s.openBoard(id);
    expect(s.getState().board.name).toBe('Other');
  });

  it('a new board left empty and unnamed is dropped on leaving it', () => {
    const { storage, s } = setup();
    const home = s.getState().boards.open;
    const id = s.newBoard();
    s.openBoard(home);
    expect(s.getState().boards.others[id]).toBeUndefined();
    expect(Object.keys(saved(storage).boards)).toEqual([home]);
  });

  it('a board saved before there were several boards opens as the home board', () => {
    const storage = memoryStorage();
    storage.setItem(BOARD_KEY, serializeBoard({ ...createBoard(), name: 'Old one' }));
    const s = createStore(storage, later);
    expect(s.getState().board.name).toBe('Old one');
    expect(s.getState().boards.open).toBe(s.getState().boards.home);
  });
});

describe('boards inside boards', () => {
  it('Add a board here puts a board card on this board that opens a new board inside it', () => {
    const { s } = setup();
    const home = s.getState().boards.open;
    const child = s.addBoardCard();
    const card = Object.values(s.getState().board.cards)[0];
    expect(card).toMatchObject({ kind: 'board', boardId: child });
    expect(s.getState().ui.selection).toEqual([card.id]);
    s.openBoard(child);
    s.renameBoard('Trips');
    expect(s.pathToOpen()).toEqual([home, child]);
    s.openBoard(home);
    // Kept, though empty when it was left: a card opens it.
    expect(s.boardName(child)).toBe('Trips');
  });

  it('undoing the card leaves the board in the list (nothing is lost); deleting the board removes its cards everywhere', () => {
    const { storage, s } = setup();
    const home = s.getState().boards.open;
    const child = s.addBoardCard();
    s.openBoard(child);
    s.addCard('note');
    s.openBoard(home);
    s.undo();
    expect(Object.keys(s.getState().board.cards)).toHaveLength(0);
    expect(s.getState().boards.others[child]).toBeDefined();
    s.redo();
    s.deleteBoard(child);
    expect(s.getState().boards.others[child]).toBeUndefined();
    expect(Object.keys(s.getState().board.cards)).toHaveLength(0);
    expect(Object.keys(saved(storage).boards)).toEqual([home]);
  });

  it('deleting the open board goes up to the board above it; the home board can’t be deleted', () => {
    const { s } = setup();
    const home = s.getState().boards.open;
    const child = s.addBoardCard();
    s.openBoard(child);
    s.addCard('note');
    s.deleteBoard(child);
    expect(s.getState().boards.open).toBe(home);
    s.deleteBoard(home);
    expect(s.getState().boards.open).toBe(home);
  });

  it('a board someone shared with this person can’t be renamed by them; one they shared can', () => {
    const { s } = setup();
    const trip = s.newBoard();
    s.renameBoard('Trip');
    const share = (owner: boolean) => ({ id: 's1', root: trip, boards: [trip], owner, ownerUid: 'a', people: [], link: null });
    s.setShares([share(false)]);
    s.renameBoard('Mine now');
    expect(s.getState().board.name).toBe('Trip');
    s.setShares([share(true)]);
    s.renameBoard('Trip 2026');
    expect(s.getState().board.name).toBe('Trip 2026');
  });
});

describe('boards from elsewhere', () => {
  it('a workspace from another device replaces every board, keeping the open one open if it still exists', () => {
    const { s } = setup();
    const home = s.getState().boards.open;
    const id = s.newBoard();
    s.renameBoard('Mine');
    const ws = { home, boards: { [home]: { ...createBoard(), name: 'Home there' }, [id]: { ...createBoard(), name: 'Changed there' } } };
    s.replaceWorkspace(ws);
    expect(s.getState().board.name).toBe('Changed there');
    expect(s.boardName(home)).toBe('Home there');
    s.replaceWorkspace({ home, boards: { [home]: ws.boards[home] } });
    expect(s.getState().boards.open).toBe(home);
    expect(s.getState().board.name).toBe('Home there');
  });

  it('workspace() is everything as saved', () => {
    const { s } = setup();
    const id = s.newBoard();
    s.renameBoard('B');
    const ws = s.workspace();
    expect(Object.keys(ws.boards)).toContain(id);
    expect(serializeWorkspace(ws)).toBe(serializeWorkspace(s.workspace()));
    expect(s.workspace()).toBe(ws); // the same object until something changes
  });
});

describe('review fixes (2026-10-05)', () => {
  it('opening another board keeps the search words but forgets the match found on the last board', () => {
    const { s } = setup();
    s.newBoard();
    s.renameBoard('B');
    s.openFind();
    s.setFindQuery('milk');
    s.showMatch({ key: 'note:x', start: 0, end: 4, showInstead: null } as never);
    s.openBoard(s.getState().boards.home);
    expect(s.getState().ui.find).toEqual({ query: 'milk', current: null });
  });
});

describe('boards changed by others, and shared boards (main session check, 2026-10-06)', () => {
  it('a board others changed starts undo afresh; other boards keep theirs', () => {
    const { s } = setup();
    const home = s.getState().boards.home;
    s.renameBoard('Home');
    const trip = s.newBoard();
    s.renameBoard('Trip');
    s.openBoard(home);
    s.renameBoard('Home again');
    // Others changed Trip: Trip's undo starts over, home's stays.
    s.replaceBoards({ [trip]: { ...createBoard(), name: 'Trip from Bob' } });
    expect(s.getState().ui.canUndo).toBe(true);
    s.openBoard(trip);
    expect(s.getState().board.name).toBe('Trip from Bob');
    expect(s.getState().ui.canUndo).toBe(false);
    // And when the open board itself is changed by others.
    s.renameBoard('Trip, mine');
    expect(s.getState().ui.canUndo).toBe(true);
    s.replaceBoards({ [trip]: { ...createBoard(), name: 'Trip from Bob again' } });
    expect(s.getState().board.name).toBe('Trip from Bob again');
    expect(s.getState().ui.canUndo).toBe(false);
  });

  it('an empty, unnamed shared board that no card opens is kept when another board opens', () => {
    const { s } = setup();
    const home = s.getState().boards.home;
    const blank = s.newBoard();
    s.setShares([{ id: 's1', root: blank, boards: [blank], owner: false, ownerUid: 'a', people: [], link: null }]);
    s.openBoard(home);
    expect(s.workspace().boards[blank]).toBeDefined();
    // Not shared: dropped, as before.
    const other = s.newBoard();
    s.openBoard(home);
    expect(s.workspace().boards[other]).toBeUndefined();
  });
});
