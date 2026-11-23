import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../model/board';
import { checklistCardOf } from '../model/mainChecklist';
import { NO_LINKS } from './collab';
import { announce, spoken } from './announce';
import { createCore } from './core';
import { createStore, type ShareInfo } from './store';

// Guards for unified per-board undo histories and commits in src/store/core.ts.

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) }));
afterEach(() => vi.unstubAllGlobals());

const immediate = (fn: () => void) => fn();

const viewShare = (id: string): ShareInfo => ({
  id: 's1',
  root: id,
  boards: [id],
  owner: false,
  ownerUid: 'sam',
  people: [],
  links: NO_LINKS,
  role: 'view',
});

function setup() {
  const s = createStore(null, immediate);
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

describe('per-board undo histories across board switches and remote replacements', () => {
  it('openBoard updates canUndo, canRedo and undoMarks to the newly opened board', () => {
    const s = setup();
    const home = s.getState().boards.home;

    // Give Home both an undo step and a redo step.
    s.renameBoard('Home 1');
    s.addCard('note');
    s.undo();
    expect(s.getState().ui.canUndo).toBe(true);
    expect(s.getState().ui.canRedo).toBe(true);
    const homeMarks = s.undoMarks();
    expect(homeMarks.undo).toBeGreaterThan(0);
    expect(homeMarks.redo).toBeGreaterThan(0);

    // Open a fresh board: neither undo nor redo is available.
    const second = s.newBoard();
    expect(s.getState().ui.canUndo).toBe(false);
    expect(s.getState().ui.canRedo).toBe(false);
    expect(s.undoMarks().undo).toBe(0);
    expect(s.undoMarks().redo).toBe(0);

    // Edit second board (undo only, no redo), then switch back to Home.
    s.renameBoard('Second');
    expect(s.getState().ui.canUndo).toBe(true);
    expect(s.getState().ui.canRedo).toBe(false);

    s.openBoard(home);
    expect(s.getState().ui.canUndo).toBe(true);
    expect(s.getState().ui.canRedo).toBe(true);
    expect(s.undoMarks().undo).toBe(homeMarks.undo);
    expect(s.undoMarks().redo).toBe(homeMarks.redo);

    // Switch back to Second: its undo-only state is intact.
    s.openBoard(second);
    expect(s.getState().ui.canUndo).toBe(true);
    expect(s.getState().ui.canRedo).toBe(false);
  });

  it('replaceBoards removing the open board falls back to Home and restores Home’s canUndo and canRedo', () => {
    const s = setup();
    const home = s.getState().boards.home;
    s.renameBoard('Home 1');
    s.addCard('note');
    s.undo();
    expect(s.getState().ui.canUndo).toBe(true);
    expect(s.getState().ui.canRedo).toBe(true);

    const shared = s.newBoard();
    s.renameBoard('Shared');
    expect(s.getState().boards.open).toBe(shared);
    expect(s.getState().ui.canRedo).toBe(false);

    s.replaceBoards({ [shared]: null });
    expect(s.getState().boards.open).toBe(home);
    expect(s.getState().board.name).toBe('Home 1');
    expect(s.getState().ui.canUndo).toBe(true);
    expect(s.getState().ui.canRedo).toBe(true);

    s.redo();
    expect(Object.keys(s.getState().board.cards)).toHaveLength(1);
  });

  it('replaceBoards replacing a non-open board clears only that board’s history', () => {
    const s = setup();
    const home = s.getState().boards.home;
    s.renameBoard('Home 1');
    const trip = s.newBoard();
    s.renameBoard('Trip 1');
    s.openBoard(home);

    // Replace Trip while Home is open: Home keeps its undo, Trip loses its undo.
    s.replaceBoards({ [trip]: { ...createBoard(), name: 'Trip from Bob' } });
    expect(s.getState().ui.canUndo).toBe(true);
    s.openBoard(trip);
    expect(s.getState().ui.canUndo).toBe(false);
    expect(s.getState().ui.canRedo).toBe(false);
    s.undo();
    expect(s.getState().board.name).toBe('Trip from Bob');
  });

  it('replaceWorkspace clears undo history on both the open board and every other board', () => {
    const s = setup();
    const home = s.getState().boards.home;
    s.renameBoard('Home 1');
    const other = s.newBoard();
    s.renameBoard('Other 1');

    const ws = s.workspace();
    s.replaceWorkspace({
      home,
      boards: {
        [home]: { ...ws.boards[home], name: 'Home remote' },
        [other]: { ...ws.boards[other], name: 'Other remote' },
      },
    });
    expect(s.getState().ui.canUndo).toBe(false);
    expect(s.getState().ui.canRedo).toBe(false);
    s.openBoard(home);
    expect(s.getState().ui.canUndo).toBe(false);
    expect(s.getState().ui.canRedo).toBe(false);
  });
});

describe('unified commits and undo on open vs non-open boards', () => {
  it('commitTo and undoOn work identically on open and non-open boards, respecting preview and locked', () => {
    const { ctx, api } = createCore(null, immediate);
    const home = ctx.state.boards.home;
    const other = 'b_other';
    ctx.setOthers((o) => ({ ...o, [other]: { ...createBoard(), name: 'Other' } }));

    // Edit non-open board via commitTo; open board's canUndo stays false.
    ctx.commitTo(other, (b) => ({ ...b, name: 'Other 1' }));
    expect(ctx.state.boards.others[other].name).toBe('Other 1');
    expect(ctx.state.ui.canUndo).toBe(false);
    expect(ctx.historyOf(other)?.past).toHaveLength(1);
    expect(api.edits()).toBe(1);

    // Undo and redo on non-open board.
    ctx.undoOn(other, 'undo');
    expect(ctx.state.boards.others[other].name).toBe('Other');
    expect(api.edits()).toBe(2);
    ctx.undoOn(other, 'redo');
    expect(ctx.state.boards.others[other].name).toBe('Other 1');
    expect(api.edits()).toBe(3);

    // Locked non-open board refuses commitTo and undoOn.
    api.setShares([viewShare(other)], true);
    ctx.commitTo(other, (b) => ({ ...b, name: 'Hacked' }));
    expect(ctx.state.boards.others[other].name).toBe('Other 1');
    ctx.undoOn(other, 'undo');
    expect(ctx.state.boards.others[other].name).toBe('Other 1');

    // Preview mode refuses commit, commitTo, scoped.commit and undoOn.
    api.setShares([], true);
    ctx.updateUi({ preview: { meta: { id: 'v', at: 1 } as never, board: ctx.state.board } });
    ctx.commit((b) => ({ ...b, name: 'Blocked' }));
    ctx.commitTo(other, (b) => ({ ...b, name: 'Blocked' }));
    ctx.scoped(other).commit((b) => ({ ...b, name: 'Blocked' }));
    ctx.undoOn(other, 'undo');
    expect(ctx.state.board.name).not.toBe('Blocked');
    expect(ctx.state.boards.others[other].name).toBe('Other 1');

    // Home is untouched throughout.
    expect(ctx.state.boards.open).toBe(home);
  });

  it('scoped(id).commit on a locked non-open board announces and clears gesture UI', () => {
    const { ctx, api } = createCore(null, immediate);
    const other = 'b_other';
    ctx.setOthers((o) => ({ ...o, [other]: { ...createBoard(), name: 'Other' } }));
    api.setShares([viewShare(other)], true);
    ctx.updateUi({ drag: { kind: 'card', id: 'c1', dx: 0, dy: 0 } as never });
    announce('');

    const res = ctx.scoped(other).commit((b) => ({ ...b, name: 'Blocked' }), { ui: { drag: null } });
    expect(res).toBeNull();
    expect(spoken()).toBe('You can’t change this board.');
    expect(ctx.state.ui.drag).toBeNull();
    expect(ctx.state.boards.others[other].name).toBe('Other');
    expect(api.edits()).toBe(0);
  });

  it('a no-op commit on a non-open board records no history and notifies no listeners when UI is unchanged', () => {
    const { ctx, api } = createCore(null, immediate);
    const other = 'b_other';
    ctx.setOthers((o) => ({ ...o, [other]: { ...createBoard(), name: 'Other' } }));
    const heard = vi.fn();
    api.subscribe(heard);

    ctx.commitTo(other, (b) => b);
    ctx.scoped(other).commit((b) => b);
    ctx.scoped(other).commit(() => null);
    expect(api.edits()).toBe(0);
    expect(ctx.historyOf(other)).toBeUndefined();
    expect(heard).not.toHaveBeenCalled();
  });

  it('scoped storeFor keeps working if its board is opened and then left again', () => {
    const s = setup();
    const home = s.getState().boards.home;
    s.openChecklist();
    const started = s.startChecklist('first')!;
    const id = started.board;
    const p = s.storeFor(id);

    // Edit while closed, open it, undo via main store, switch back to Home, redo via panel.
    const card = () => checklistCardOf(s.workspace().boards[id])!;
    p.itemEnter(card().id, card().items[0].id);
    expect(card().items).toHaveLength(2);

    s.openBoard(id);
    expect(s.getState().ui.canUndo).toBe(true);
    s.undo();
    expect(card().items).toHaveLength(1);
    expect(s.getState().ui.canRedo).toBe(true);

    s.openBoard(home);
    expect(s.getState().ui.canRedo).toBe(false);
    s.redoChecklist();
    expect(card().items).toHaveLength(2);
  });
});
