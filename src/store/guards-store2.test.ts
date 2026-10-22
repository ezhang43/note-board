import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findItem } from '../model/checklist';
import type { StorageLike } from '../model/persist';
import { readWorkspace } from '../model/workspace';
import { BOARD_KEY } from '../model/persist';
import type { TodoCard } from '../model/types';
import { BOARD_SAVE_DELAY, COMPLETE_LEAVE_MS, createStore } from './store';

// More store guards (review pass, job 156): a tick still animating when another board opens, and
// deleting a board that cards on other boards open. Every test passes today. They run with motion
// allowed (a tick waits for its leaving animation).
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function memoryStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
}

describe('a tick still animating when another board opens (G2)', () => {
  function setup() {
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1200, height: 800 });
    const home = s.getState().boards.open;
    s.addCard('todo');
    const cardId = s.getState().ui.selection[0];
    const list = () => s.workspace().boards[home].cards[cardId] as TodoCard;
    const first = list().items[0].id;
    s.setItemText(cardId, first, 'one');
    s.itemEnter(cardId, first);
    return { s, home, cardId, first, list };
  }
  const isDone = (list: TodoCard, id: string) => findItem(list.items, id)?.item.done;

  it('is kept on the board it was made on, not lost and not carried over', () => {
    const { s, home, cardId, first, list } = setup();
    s.toggleItem(cardId, first);
    s.newBoard();
    s.renameBoard('Other');
    vi.advanceTimersByTime(COMPLETE_LEAVE_MS + 50);
    expect(isDone(list(), first)).toBe(true);
    expect(Object.keys(s.getState().board.cards)).toHaveLength(0);
    // Back on Home it stands, and Ctrl+Z there takes the tick back (it was an undo step on Home).
    s.openBoard(home);
    expect(isDone(s.getState().board.cards[cardId] as TodoCard, first)).toBe(true);
    s.undo();
    expect(isDone(s.getState().board.cards[cardId] as TodoCard, first)).toBe(false);
  });
});

describe('deleting a board that cards on other boards open (G7)', () => {
  function setup() {
    const storage = memoryStorage();
    const s = createStore(storage, (fn) => fn());
    const home = s.getState().boards.open;
    const child = s.addBoardCard();
    s.copySelection();
    const other = s.newBoard();
    s.renameBoard('Other');
    s.paste();
    s.openBoard(home);
    return { s, storage, home, child, other };
  }
  const opening = (s: ReturnType<typeof createStore>, boardId: string, child: string) => Object.values(s.workspace().boards[boardId].cards).filter((c) => c.kind === 'board' && c.boardId === child);

  it('is set up as meant: both boards have a card that opens the sub-board', () => {
    const { s, home, child, other } = setup();
    expect(opening(s, home, child)).toHaveLength(1);
    expect(opening(s, other, child)).toHaveLength(1);
  });

  it('removes those cards from every board, open or not, and from what is saved', () => {
    const { s, storage, home, child, other } = setup();
    s.deleteBoard(child);
    expect(s.workspace().boards[child]).toBeUndefined();
    expect(opening(s, home, child)).toEqual([]);
    expect(opening(s, other, child)).toEqual([]);
    vi.advanceTimersByTime(BOARD_SAVE_DELAY);
    const saved = readWorkspace(storage.data[BOARD_KEY])!.ws;
    expect(saved.boards[child]).toBeUndefined();
    for (const b of Object.values(saved.boards)) expect(Object.values(b.cards).some((c) => c.kind === 'board' && c.boardId === child)).toBe(false);
  });

  it('Ctrl+Z on the board it was deleted from brings back that board’s card only; the sub-board itself stays deleted', () => {
    const { s, home, child, other } = setup();
    s.deleteBoard(child);
    s.undo();
    expect(opening(s, home, child)).toHaveLength(1);
    expect(opening(s, other, child)).toEqual([]);
    expect(s.workspace().boards[child]).toBeUndefined();
  });
});
