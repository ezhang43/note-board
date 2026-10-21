import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as B from '../model/board';
import { createCard } from '../model/cards';
import { journalDateLine } from '../model/journal';
import { BOARD_KEY, type StorageLike } from '../model/persist';
import { fromPlain } from '../model/richText';
import { serializeWorkspace } from '../model/workspace';
import { createStore } from './store';

// Guards for the store core that no other test reached (review pass, job 156): the tidy-up queue
// (the tests elsewhere run it at once, which hides ordering), undo counts, which gesture survives an
// undo, and what a saved "open board" does when that board is gone. Every test passes today.

function memoryStorage(init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = { ...init };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
}

/** A schedule that holds the tidy-up until run(), as the browser does (one frame later). */
function queued() {
  const q: (() => void)[] = [];
  return { schedule: (fn: () => void) => void q.push(fn), run: () => q.splice(0).forEach((f) => f()), size: () => q.length };
}

/** Saved boards: home with notes k_a at (0,0) and k_b at (0,200); b_other with k_x and k_y. */
function twoBoards(extra: Record<string, string> = {}) {
  let home = { ...B.createBoard(), name: 'Home' };
  home = B.addCard(home, createCard('note', 'k_a'), { type: 'loose', x: 0, y: 0 });
  home = B.addCard(home, createCard('note', 'k_b'), { type: 'loose', x: 0, y: 200 });
  let other = { ...B.createBoard(), name: 'Other' };
  other = B.addCard(other, createCard('note', 'k_x'), { type: 'loose', x: 0, y: 0 });
  other = B.addCard(other, createCard('note', 'k_y'), { type: 'loose', x: 0, y: 20 });
  return memoryStorage({ [BOARD_KEY]: serializeWorkspace({ home: 'home', boards: { home, b_other: other } }), ...extra });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the tidy-up waits one frame, and only one runs', () => {
  it('several height reports in one frame queue one tidy-up', () => {
    const q = queued();
    const s = createStore(twoBoards(), q.schedule);
    s.setMeasuredHeight('k_a', 120);
    s.setMeasuredHeight('k_b', 80);
    s.setMeasuredHeight('k_a', 130);
    expect(q.size()).toBe(1);
  });

  it('nothing moves during a drag, and the tidy-up kept from before is used when the drag ends', () => {
    const q = queued();
    const s = createStore(twoBoards(), q.schedule);
    s.setViewportSize({ width: 1200, height: 800 });
    s.setMeasuredHeight('k_b', 100);
    q.run();
    s.setMeasuredHeight('k_a', 400);
    s.startDrag('card', 'k_b', 0, 200);
    q.run();
    const card = (id: string) => s.getState().board.cards[id];
    expect(card('k_b').y).toBe(200); // not moved while it is being dragged
    expect(q.size()).toBe(0);
    s.cancelDrag();
    q.run();
    expect(card('k_a').y).toBe(0);
    expect(card('k_b').y).toBe(420); // pushed below the 400-tall block
  });
});

describe('which gestures an undo ends', () => {
  it('undo ends a drag, a resize and a held item drag, but not a block dragged in from the toolbar', () => {
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1200, height: 800 });
    s.addCard('note');
    const id = s.getState().ui.selection[0];
    s.addCard('todo');
    s.startDrag('card', id, 0, 0);
    expect(s.getState().ui.drag).not.toBeNull();
    s.undo();
    expect(s.getState().ui.drag).toBeNull();

    s.showResize({ kind: 'card', id, dir: 'e', x: 0, y: 0, w: 300, h: null, liveW: 300, liveH: null, liveX: 0, liveY: 0, matchIds: [], label: '', labelAt: { x: 0, y: 0 } });
    expect(s.getState().ui.resize).not.toBeNull();
    s.undo();
    expect(s.getState().ui.resize).toBeNull();

    s.startNewDrag('note');
    s.undo();
    // Pinned as it is today (a new-block drag survives an undo); change this on purpose, not by accident.
    expect(s.getState().ui.newDrag).not.toBeNull();
  });
});

describe('undo depth', () => {
  it('keeps exactly 100 steps', () => {
    const s = createStore(null, (fn) => fn());
    s.setViewportSize({ width: 1200, height: 800 });
    for (let i = 0; i < 101; i++) s.toggleSnap();
    let steps = 0;
    while (s.getState().ui.canUndo && steps < 200) {
      s.undo();
      steps++;
    }
    expect(steps).toBe(100);
    expect(s.getState().ui.canUndo).toBe(false);
  });
});

describe('opening', () => {
  it('a saved open board that another device deleted opens Home; one that exists opens', () => {
    const gone = createStore(twoBoards({ 'note-board:open': 'b_gone' }), (fn) => fn());
    expect(gone.getState().boards.open).toBe('home');
    expect(gone.getState().board.name).toBe('Home');
    const there = createStore(twoBoards({ 'note-board:open': 'b_other' }), (fn) => fn());
    expect(there.getState().boards.open).toBe('b_other');
    expect(there.getState().boards.others.home).toBeDefined();
  });

  it('takeCentreOnArrival is true once after a new board or a board arriving on an empty one, else false', () => {
    const s = createStore(null, (fn) => fn());
    expect(s.takeCentreOnArrival()).toBe(false);
    s.newBoard();
    expect(s.takeCentreOnArrival()).toBe(true);
    expect(s.takeCentreOnArrival()).toBe(false);
    const arriving = B.addCard(B.createBoard(), createCard('note', 'n'), { type: 'loose', x: 0, y: 0 });
    s.replaceBoard(arriving);
    expect(s.takeCentreOnArrival()).toBe(true);
    s.replaceWorkspace(s.workspace()); // the open board now has a card
    expect(s.takeCentreOnArrival()).toBe(false);
  });
});

describe('Journal changes and old versions', () => {
  const today = journalDateLine(new Date(2026, 9, 18));

  it('while an old version is shown, typing in the Journal and undoing it change nothing', () => {
    vi.setSystemTime(new Date(2026, 9, 18, 10, 0));
    const s = createStore(memoryStorage(), (fn) => fn());
    s.setViewportSize({ width: 1000, height: 800 });
    s.openJournal();
    const id = s.getState().ui.journalBoard!;
    const note = Object.values(s.workspace().boards[id].cards)[0];
    expect(note.kind === 'note' && note.text).toBe(`${today}\n\n`);
    s.previewVersion({ savedAt: 0 } as never, B.createBoard());
    const before = s.workspace().boards[id];
    s.setJournal(note.id, fromPlain('x'));
    s.undoJournal();
    expect(s.workspace().boards[id]).toBe(before);
  });

  it('Journal edits leave the toolbar Undo alone, and an undo counts as an edit for version history', () => {
    vi.setSystemTime(new Date(2026, 9, 18, 10, 0));
    const s = createStore(memoryStorage(), (fn) => fn());
    s.setViewportSize({ width: 1000, height: 800 });
    s.openJournal();
    const id = s.getState().ui.journalBoard!;
    const note = Object.values(s.workspace().boards[id].cards)[0];
    s.setJournal(note.id, fromPlain('hello'));
    expect(s.getState().ui.canUndo).toBe(false);
    const edits = s.edits();
    s.undoJournal();
    expect(s.edits()).toBe(edits + 1);
  });
});
