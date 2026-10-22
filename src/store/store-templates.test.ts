import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_KEY, type StorageLike } from '../model/persist';
import { createBoard, problems } from '../model/board';
import { DEFAULT_BOARD_NAME } from '../model/constants';
import { EXAMPLE, TEMPLATES } from '../model/templates';
import { readWorkspace } from '../model/workspace';
import { BOARD_SAVE_DELAY, createStore } from './store';

// Starting from a template (owner request, job #162, 2026-10-22): an empty open board is filled
// (one undo step); a board with cards is left alone and a new board opens; the example always opens
// as a board of its own.

function memoryStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
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
const weekly = TEMPLATES[0];
const saved = (storage: { data: Record<string, string> }) => {
  vi.advanceTimersByTime(BOARD_SAVE_DELAY);
  return readWorkspace(storage.data[BOARD_KEY])!.ws;
};

describe('startFromTemplate on an empty board', () => {
  it('fills the open board and names it after the template, in one undo step', () => {
    const { s } = setup();
    const home = s.getState().boards.open;
    expect(s.getState().board.name).toBe(DEFAULT_BOARD_NAME);
    expect(s.startFromTemplate(weekly.id)).toBe('filled');
    const { board, boards } = s.getState();
    expect(boards.open).toBe(home); // the same board, not a new one
    expect(board.name).toBe('Weekly plan');
    expect(board.order).toHaveLength(4);
    expect(problems(board)).toEqual([]);
    s.undo();
    expect(s.getState().board.order).toEqual([]);
    expect(s.getState().board.name).toBe(DEFAULT_BOARD_NAME);
    s.redo();
    expect(s.getState().board.order).toHaveLength(4);
  });

  it('keeps a name the person already gave the board', () => {
    const { s } = setup();
    s.renameBoard('Home');
    s.startFromTemplate(weekly.id);
    expect(s.getState().board.name).toBe('Home');
    expect(s.getState().board.order).toHaveLength(4);
  });

  it('is saved like any other change, and a reload shows the filled board', () => {
    const { storage, s } = setup();
    s.startFromTemplate(TEMPLATES[2].id);
    const ws = saved(storage);
    expect(ws.boards[ws.home].name).toBe('Trip plan');
    const again = createStore({ getItem: (k) => storage.data[k] ?? null, setItem: () => {} }, later);
    expect(again.getState().board.order).toHaveLength(4);
  });

  it('does not rename a board someone shared with this person (review finding), but fills it', () => {
    const { s } = setup();
    const open = s.getState().boards.open;
    s.setShares([{ id: 's1', root: open, boards: [open], owner: false, ownerUid: 'a', people: [], links: { edit: null, comment: null, view: null, roles: false } }], true);
    expect(s.startFromTemplate(weekly.id)).toBe('filled');
    expect(s.getState().board.name).toBe(DEFAULT_BOARD_NAME);
    expect(s.getState().board.order).toHaveLength(4);
  });

  it('does nothing for an id that is not a template', () => {
    const { s } = setup();
    expect(s.startFromTemplate('nope')).toBeNull();
    expect(s.getState().board.order).toEqual([]);
  });
});

describe('startFromTemplate on a board that has cards', () => {
  it('leaves the open board alone and opens a new board made from the template', () => {
    const { s } = setup();
    s.addCard('note');
    const home = s.getState().boards.open;
    const before = s.getState().board;
    expect(s.startFromTemplate(weekly.id)).toBe('opened');
    const { board, boards } = s.getState();
    expect(boards.open).not.toBe(home);
    expect(boards.others[home]).toBe(before);
    expect(board.name).toBe('Weekly plan');
    expect(problems(board)).toEqual([]);
    expect(boards.home).toBe(home); // the home board stays home
  });

  it('is not dropped as an empty unnamed board when another board opens', () => {
    const { s } = setup();
    s.addCard('note');
    const home = s.getState().boards.open;
    s.startFromTemplate(weekly.id);
    const made = s.getState().boards.open;
    s.openBoard(home);
    expect(Object.keys(s.getState().boards.others)).toContain(made);
  });

  it('two uses make two boards with their own ids', () => {
    const { s } = setup();
    s.addCard('note');
    s.startFromTemplate(weekly.id);
    const first = s.getState().boards.open;
    s.openBoard(s.getState().boards.home);
    s.startFromTemplate(weekly.id);
    const second = s.getState().boards.open;
    expect(second).not.toBe(first);
    const a = Object.keys(s.getState().boards.others[first].cards);
    const b = Object.keys(s.getState().board.cards);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });
});

describe('while an old version is shown (review finding)', () => {
  it('opens a new board, as New board does, and never tries to fill the blank board behind the preview', () => {
    const { s } = setup();
    const home = s.getState().boards.open;
    s.previewVersion({ id: 'v1', at: 0 } as never, createBoard());
    expect(s.startFromTemplate(weekly.id)).toBe('opened');
    expect(s.getState().boards.open).not.toBe(home);
    expect(s.getState().ui.preview).toBeNull();
    expect(s.getState().board.name).toBe('Weekly plan');
  });
});

describe('the example', () => {
  it('opens as a new board even from an empty board, which stays as it was', () => {
    const { s } = setup();
    const home = s.getState().boards.open;
    expect(s.startFromTemplate(EXAMPLE.id, true)).toBe('opened');
    const { board, boards } = s.getState();
    expect(boards.open).not.toBe(home);
    expect(board.name).toBe('Weekend in Lisbon');
    expect(boards.others[home].order).toEqual([]);
    // The empty home board is kept: it is the home board, never dropped.
    s.openBoard(home);
    expect(s.getState().boards.open).toBe(home);
  });
});
