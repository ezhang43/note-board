import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { journalDateLine } from '../model/journal';
import type { StorageLike } from '../model/persist';
import { createStore } from './store';

// Daily journal (owner request, 2026-10-18): the Journal button.

const memoryStorage = (): StorageLike => {
  const data: Record<string, string> = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
};
const later = (fn: () => void) => fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 18, 10, 0));
});
afterEach(() => vi.useRealTimers());

type Store = ReturnType<typeof setup>;
function setup() {
  const s = createStore(memoryStorage(), later);
  s.setViewportSize({ width: 1000, height: 800 });
  return s;
}
const today = journalDateLine(new Date(2026, 9, 18));
const notes = (s: Store) => Object.values(s.getState().board.cards).filter((c) => c.kind === 'note');
const journals = (s: Store) => Object.values(s.workspace().boards).filter((b) => b.name === 'Journal');
const textOf = (c: { kind: string; text?: string }) => c.text ?? '';

describe('Journal button', () => {
  it('first press: makes a Journal board inside home, opens it, adds a dated note with the cursor in it', () => {
    const s = setup();
    const home = s.getState().boards.home;
    expect(s.journal()).toBeNull();
    const { boards, board, ui } = s.getState();
    expect(boards.open).not.toBe(home);
    expect(board.name).toBe('Journal');
    expect(journals(s)).toHaveLength(1);
    // A board card on home opens it.
    const card = Object.values(s.workspace().boards[home].cards).find((c) => c.kind === 'board');
    expect(card && card.kind === 'board' && card.boardId).toBe(boards.open);
    const [note] = notes(s);
    expect(textOf(note)).toBe(`${today}\n\n`);
    expect(ui.selection).toEqual([note.id]);
    expect(ui.focusBlock).toBe(note.id);
  });

  it('second press the same day adds nothing; it selects and focuses the note again', () => {
    const s = setup();
    s.journal();
    const [note] = notes(s);
    s.clearSelection();
    s.focusTaken(note.id);
    s.journal();
    expect(notes(s)).toHaveLength(1);
    expect(journals(s)).toHaveLength(1);
    expect(s.getState().ui.selection).toEqual([note.id]);
    expect(s.getState().ui.focusBlock).toBe(note.id);
  });

  it('an existing note that is collapsed is selected but takes no cursor', () => {
    const s = setup();
    s.journal();
    const [note] = notes(s);
    s.toggleCollapsed(note.id);
    s.journal();
    expect(s.getState().ui.selection).toEqual([note.id]);
    expect(s.getState().ui.focusBlock).toBeNull();
    expect(notes(s)).toHaveLength(1);
  });

  it('pressed from another board, it goes to the one Journal board', () => {
    const s = setup();
    s.journal();
    const journal = s.getState().boards.open;
    const other = s.newBoard();
    expect(s.getState().boards.open).toBe(other);
    s.renameBoard('Recipes');
    s.journal();
    expect(s.getState().boards.open).toBe(journal);
    expect(Object.keys(s.workspace().boards)).toHaveLength(3);
    expect(notes(s)).toHaveLength(1);
  });

  it('the next day adds a new note above the old one, which stays', () => {
    const s = setup();
    s.journal();
    vi.setSystemTime(new Date(2026, 9, 19, 9, 0));
    s.journal();
    const found = notes(s);
    expect(found).toHaveLength(2);
    const fresh = found.find((c) => textOf(c).startsWith('Mon 19 Oct 2026'))!;
    const old = found.find((c) => textOf(c).startsWith('Sun 18 Oct 2026'))!;
    expect(fresh.y).toBeLessThan(old.y);
    expect(s.getState().ui.focusBlock).toBe(fresh.id);
  });

  it('adding the note is one undo step, and it leaves the Journal board and its card', () => {
    const s = setup();
    s.journal();
    expect(notes(s)).toHaveLength(1);
    s.undo();
    expect(notes(s)).toHaveLength(0);
    expect(s.getState().board.name).toBe('Journal');
    expect(journals(s)).toHaveLength(1);
    // Pressing again puts today's note back, without a second Journal board.
    s.journal();
    expect(notes(s)).toHaveLength(1);
    expect(journals(s)).toHaveLength(1);
  });

  it('never uses a board that a share holds, and never makes it inside one', () => {
    const s = setup();
    const home = s.getState().boards.home;
    const shared = s.newBoard();
    s.renameBoard('Journal');
    s.openBoard(home);
    s.setShares([{ id: 's1', root: shared, boards: [shared], owner: false, ownerUid: 'alice', people: [], link: null }], true);
    s.journal();
    expect(s.getState().boards.open).not.toBe(shared);
    expect(s.getState().board.name).toBe('Journal');
    expect(s.workspace().boards[shared].cards).toEqual({});
    expect(journals(s)).toHaveLength(2);
  });

  it('waits (changing nothing) until it is known which boards are shared', () => {
    const s = setup();
    s.setShares([], false);
    expect(s.journal()).toBe('loading');
    expect(Object.keys(s.workspace().boards)).toHaveLength(1);
  });

  it('puts an old version being looked at away first', () => {
    const s = setup();
    s.previewVersion({ savedAt: 0 } as never, s.getState().board);
    s.journal();
    expect(s.getState().ui.preview).toBeNull();
    expect(notes(s)).toHaveLength(1);
  });
});
