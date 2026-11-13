import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completedCardOf } from '../model/completed';
import { CARD_W, GRID, NEW_BLOCK_H } from '../model/constants';
import { CHECKLIST_NAME, checklistCardOf } from '../model/mainChecklist';
import type { StorageLike } from '../model/persist';
import type { TodoCard } from '../model/types';
import { createBoard } from '../model/board';
import { serializeWorkspace } from '../model/workspace';
import { createStore } from './store';
import { startSync, SYNC_DELAY, type Remote, type RemoteDoc } from './sync';

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
/** The panel's board, its store and its checklist (started as typing in the empty list would). */
function panel(s: Store) {
  if (!s.checklistBoard() || !checklistCardOf(s.workspace().boards[s.checklistBoard()!])) s.startChecklist('');
  const id = s.checklistBoard()!;
  const p = s.storeFor(id);
  const list = () => checklistCardOf(s.workspace().boards[id])!;
  return { id, p, list };
}

describe('Checklist panel', () => {
  it('opens on the left, beside a right-hand panel, and makes nothing until the first change', () => {
    const s = setup();
    expect(s.checklistBoard()).toBeNull();
    s.openJournal();
    const before = s.workspace();
    expect(s.openChecklist()).toBeNull();
    expect(s.getState().ui.checklistOpen).toBe(true);
    expect(s.getState().ui.sidePanel).toBe('journal'); // both open
    // Opening saves nothing: no board is made, nothing changes (so nothing is synced).
    expect(s.workspace()).toBe(before);
    expect(s.checklistBoard()).toBeNull();
    // The first typing makes the board, with its one list holding what was typed.
    const made = s.startChecklist('call mum')!;
    expect(checklistIds(s)).toEqual([made.board]);
    const { list } = panel(s);
    expect(list().title).toBe('Checklist');
    expect(list().items.map((i) => i.text)).toEqual(['call mum']);
    expect(s.getState().ui.focusItem).toBe(list().items[0].id);
    expect(s.getState().board.cards).toEqual(before.boards[before.home].cards); // the open board is unchanged
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

  it('the Completed panel’s × (and Escape) closes it in one press', () => {
    const s = setup();
    s.openChecklist();
    s.toggleSidePanel('completed');
    s.closeCompleted();
    expect(s.getState().ui).toMatchObject({ sidePanel: null, checklistOpen: true });
  });

  it('a board someone named "Main checklist" without a list gets one clear of what is on it', () => {
    const s = setup();
    s.renameBoard(CHECKLIST_NAME);
    s.addCard('note');
    // Put the note at the board's top left corner, where a list placed without looking would land.
    const placed = Object.values(s.getState().board.cards)[0];
    s.select(placed.id);
    s.nudgeSelection(-placed.x / GRID, -placed.y / GRID); // nudges are in grid steps
    expect(s.getState().board.cards[placed.id]).toMatchObject({ x: 0, y: 0 });
    const mine = s.getState().boards.open;
    s.newBoard();
    expect(s.getState().boards.open).not.toBe(mine);
    s.openChecklist();
    expect(s.checklistBoard()).toBe(mine);
    expect(checklistCardOf(s.workspace().boards[mine])).toBeNull(); // opening adds nothing
    s.startChecklist('first');
    const board = s.workspace().boards[mine];
    const note = Object.values(board.cards).find((c) => c.kind === 'note')!;
    const list = checklistCardOf(board)!;
    expect(list.title).toBe('Checklist');
    // Not on top of the note: the note's place is kept, and the list starts below or beside it.
    expect(note).toMatchObject({ x: 0, y: 0 });
    // (Blocks of their natural size: a card is CARD_W wide; a new note is taken as NEW_BLOCK_H.note tall.)
    expect(list.x >= CARD_W || list.y >= NEW_BLOCK_H.note || list.x + CARD_W <= 0 || list.y + NEW_BLOCK_H.todo <= 0).toBe(true);
  });

  it('restoring an item whose list was deleted puts it in the panel’s current list, not a new one', () => {
    const s = setup();
    s.openChecklist();
    const { id, p, list } = panel(s);
    const first = list();
    p.setItemText(first.id, first.items[0].id, 'old task');
    p.toggleItem(first.id, first.items[0].id);
    p.cleanUpList(first.id);
    const entry = completedCardOf(s.workspace().boards[id])!.groups[0].entries[0].item.id;
    // Its list deleted (on the board itself), then a new one started in the panel.
    s.openBoard(id);
    s.deleteCard(first.id);
    expect(checklistCardOf(s.getState().board)).toBeNull();
    s.newBoard();
    s.startChecklist('new task');
    const now = list();
    expect(now.id).not.toBe(first.id);
    s.storeFor(id).restoreCompleted(entry);
    const lists = Object.values(s.workspace().boards[id].cards).filter((c) => c.kind === 'todo');
    expect(lists).toHaveLength(1);
    expect(list().items.map((i) => i.text)).toEqual(['new task', 'old task']);
    expect(s.hiddenBoards()).toContain(id);
  });

  it('while an old version is shown, the empty list starts nothing', () => {
    const s = setup();
    s.openChecklist();
    s.previewVersion({ id: 'v1', at: 0, size: 0, label: 'Earlier' } as never, createBoard());
    expect(s.startChecklist('lost?')).toBeNull();
    expect(s.checklistBoard()).toBeNull();
  });
});

/** A pretend online copy (as in sync.test.ts): the test decides when versions arrive. */
function fakeRemote() {
  let listener: ((doc: RemoteDoc | null) => void) | null = null;
  const writes: RemoteDoc[] = [];
  const remote: Remote = {
    watch(onChange) {
      listener = onChange;
      return () => (listener = null);
    },
    write: (doc) => {
      writes.push(doc);
      return Promise.resolve();
    },
  };
  return { remote, writes, send: (doc: RemoteDoc | null) => listener?.(doc) };
}

/**
 * A board list with "board done" cleaned up, and the Main checklist with "list done" cleaned up and "keep" left
 * in it (the owner, 2026-11-13: the checklist's cleaned-up items show in every board's Completed panel).
 */
function mixed() {
  const s = setup();
  s.addCard('todo');
  const boardList = s.getState().ui.selection[0];
  const boardItem = (s.getState().board.cards[boardList] as TodoCard).items[0].id;
  s.setItemText(boardList, boardItem, 'board done');
  s.toggleItem(boardList, boardItem);
  s.cleanUp();
  s.openChecklist();
  const { id, p, list } = panel(s);
  const first = list().items[0].id;
  p.setItemText(list().id, first, 'list done');
  p.itemEnter(list().id, first);
  p.setItemText(list().id, s.getState().ui.focusItem!, 'keep');
  p.toggleItem(list().id, first);
  p.cleanUpList(list().id);
  s.toggleSidePanel('completed');
  const texts = () => list().items.map((i) => i.text);
  const boardTexts = () => (s.getState().board.cards[boardList] as TodoCard).items.map((i) => i.text);
  return { s, id, p, list, texts, boardTexts, boardItem, listItem: first };
}

describe('the Completed panel with the Main checklist’s items mixed in (owner, 2026-11-13)', () => {
  it('mixes in the Main checklist’s record: not while it is the open board, not before shares are known, not when there is none', () => {
    const none = setup();
    expect(none.completedChecklist()).toBeNull();
    const { s, id } = mixed();
    expect(s.completedChecklist()).toBe(id);
    s.setShares([], false);
    expect(s.completedChecklist()).toBeNull(); // it could still turn out to be a share's board
    s.setShares([], true);
    const home = s.getState().boards.open;
    s.openBoard(id);
    expect(s.completedChecklist()).toBeNull(); // shown once, as the board's own
    s.openBoard(home);
    expect(s.completedChecklist()).toBe(id);
  });

  it('unticking a checklist item sends it back to the checklist, one undo step there; the open board is untouched', () => {
    const { s, id, texts, listItem } = mixed();
    const open = s.getState().board;
    s.untickCompleted(listItem, true);
    expect(texts()).toEqual(['keep', 'list done']);
    expect(completedCardOf(s.workspace().boards[id])!.groups).toEqual([]);
    expect(s.getState().board).toBe(open);
    // Ctrl+Z in the Completed panel undoes it on the checklist, Ctrl+Y redoes it.
    s.undoCompleted();
    expect(texts()).toEqual(['keep']);
    expect(s.getState().board).toBe(open);
    s.redoCompleted();
    expect(texts()).toEqual(['keep', 'list done']);
    expect(s.getState().board).toBe(open);
  });

  it('Ctrl+Z there steps back through the panel’s own unticks, newest first, then acts on the open board as before', () => {
    const { s, texts, boardTexts, listItem, boardItem } = mixed();
    s.untickCompleted(listItem, true);
    s.untickCompleted(boardItem, false);
    expect(boardTexts()).toEqual(['', 'board done']);
    s.undoCompleted(); // the last untick was on the board
    expect(boardTexts()).toEqual(['']);
    expect(texts()).toEqual(['keep', 'list done']);
    s.undoCompleted(); // then the checklist's
    expect(texts()).toEqual(['keep']);
    // No more unticks to take back: the next goes to the open board (its Clean up), never further back on the checklist.
    s.undoCompleted();
    expect(texts()).toEqual(['keep']);
    expect(boardTexts()).toEqual(['board done']);
    // Redo walks forward the same way.
    s.redoCompleted(); // the board's Clean up again (as Ctrl+Y on the board)
    s.redoCompleted();
    expect(texts()).toEqual(['keep', 'list done']);
  });

  it('once the checklist has changed since the untick, Ctrl+Z there leaves it alone and acts on the open board', () => {
    const { s, p, list, texts, boardTexts, listItem } = mixed();
    s.untickCompleted(listItem, true);
    p.setItemText(list().id, list().items[0].id, 'keep it'); // typed in the Checklist panel afterwards
    s.undoCompleted();
    expect(texts()).toEqual(['keep it', 'list done']);
    expect(boardTexts()).toEqual(['board done']); // the open board's Clean up undone, as Ctrl+Z there did before
  });

  it('reopening the panel starts afresh: Ctrl+Z there is the open board’s', () => {
    const { s, texts, listItem } = mixed();
    s.untickCompleted(listItem, true);
    s.closeCompleted();
    s.toggleSidePanel('completed');
    s.undoCompleted();
    expect(texts()).toEqual(['keep', 'list done']);
  });

  it('nothing goes back while the open board is read-only or an old version is shown', () => {
    const { s, id, texts, listItem } = mixed();
    const open = s.getState().boards.open;
    const share = { id: 'sh', root: open, boards: [open], owner: false, ownerUid: 'x', people: [], links: { view: null, comment: null, edit: null }, role: 'view' };
    s.setShares([share] as never, true);
    s.untickCompleted(listItem, true);
    expect(texts()).toEqual(['keep']);
    s.setShares([], true);
    s.previewVersion({ id: 'v', at: 0 } as never, s.getState().board);
    s.untickCompleted(listItem, true);
    expect(texts()).toEqual(['keep']);
    s.endPreview();
    s.untickCompleted(listItem, true);
    expect(texts()).toEqual(['keep', 'list done']);
    expect(completedCardOf(s.workspace().boards[id])!.groups).toEqual([]);
  });

  it('while the Main checklist is the open board, its items untick as the board’s own', () => {
    const { s, id, texts, listItem } = mixed();
    s.openBoard(id);
    s.toggleSidePanel('completed');
    s.untickCompleted(listItem, false);
    expect(texts()).toEqual(['keep', 'list done']);
    s.undoCompleted();
    expect(texts()).toEqual(['keep']);
  });
});

describe('Checklist panel and sync (PR 274 check)', () => {
  const online = (name: string) => {
    const home = 'home';
    return { data: serializeWorkspace({ home, boards: { [home]: { ...createBoard(), name } } }), client: 'laptop' };
  };
  const names = (doc: RemoteDoc) => Object.values(JSON.parse(doc.data).boards as Record<string, { name: string }>).map((b) => b.name);

  it('a device with an older offline copy that opens the panel before the online copy arrives keeps the newer online boards', () => {
    const s = setup();
    const fake = fakeRemote();
    startSync(s, fake.remote, { client: 'me', onReady: () => {}, onError: () => {}, onSaveState: () => {} });
    // It opens on this device's offline copy (out of date)...
    fake.send({ ...online('Old offline copy'), client: 'me', cached: true });
    expect(s.getState().board.name).toBe('Old offline copy');
    s.openChecklist(); // ...and the panel is opened before the server's copy has arrived
    fake.send(online('Newer, from the laptop'));
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    expect(s.getState().board.name).toBe('Newer, from the laptop');
    for (const w of fake.writes) expect(names(w)).toContain('Newer, from the laptop');
    expect(s.getState().ui.checklistOpen).toBe(true);
  });

  it('two up-to-date devices opening the panel upload nothing; the first typing does', () => {
    const s = setup();
    const fake = fakeRemote();
    startSync(s, fake.remote, { client: 'me', onReady: () => {}, onError: () => {}, onSaveState: () => {} });
    fake.send(online('Shared home'));
    s.openChecklist();
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    expect(fake.writes).toEqual([]);
    s.startChecklist('x');
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    expect(fake.writes).toHaveLength(1);
    expect(names(fake.writes[0])).toContain(CHECKLIST_NAME);
  });
});
