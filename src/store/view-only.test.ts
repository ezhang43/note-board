import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_KEY, type StorageLike } from '../model/persist';
import { boardRights, viewOnly } from '../model/sharing';
import { readWorkspace } from '../model/workspace';
import { memoryServer, NO_LINKS, type Person, type Role } from './collab';
import { sharesKey, startSharing } from './sharing';
import { BOARD_SAVE_DELAY, createStore, type ShareInfo } from './store';

// Read-only boards (job 161, PR 3): a board shared with someone as Can comment or Can view can't
// be changed by them. The store refuses every change to it (one check where every change passes),
// their own boards stay as they were, and sharing never sends anything for it.

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const shareOf = (root: string, boards: string[], role: Role | undefined, owner = false): ShareInfo => ({
  id: 's1',
  root,
  boards,
  owner,
  ownerUid: owner ? 'me' : 'sam',
  people: [],
  links: NO_LINKS,
  ...(role ? { role } : {}),
});

describe('viewOnly and boardRights', () => {
  it('a board in a share whose role here is view or comment is read-only; edit, unknown or own boards are not', () => {
    for (const role of ['view', 'comment'] as const) expect(viewOnly([shareOf('t', ['t', 'in'], role)], 'in')).toBe(true);
    expect(viewOnly([shareOf('t', ['t', 'in'], 'edit')], 't')).toBe(false);
    expect(viewOnly([shareOf('t', ['t', 'in'], undefined)], 't')).toBe(false);
    expect(viewOnly([shareOf('t', ['t'], 'view')], 'mine')).toBe(false);
  });

  it('a board inside a read-only share can’t be renamed or deleted (an editor’s can)', () => {
    expect(boardRights([shareOf('t', ['t', 'in'], 'view')], 'in', 'home')).toMatchObject({ rename: false, delete: false });
    expect(boardRights([shareOf('t', ['t', 'in'], 'edit')], 'in', 'home')).toMatchObject({ rename: true, delete: true });
  });
});

/** A store with a board "Trip" (a note, a checklist with an item, a sub-board) and the home board. */
function setup(role: Role | undefined = 'view') {
  const storage = memoryStorage();
  const s = createStore(storage, (fn) => fn());
  s.setViewportSize({ width: 1000, height: 800 });
  const home = s.getState().boards.open;
  s.addCard('note');
  const homeNote = s.getState().ui.selection[0];
  const trip = s.newBoard();
  s.renameBoard('Trip');
  s.addCard('note');
  const note = s.getState().ui.selection[0];
  s.setNoteText(note, 'Tent');
  s.addCard('todo');
  const list = s.getState().ui.selection[0];
  s.focusFirstItem(list);
  const card = s.getState().board.cards[list];
  const item = card.kind === 'todo' ? card.items[0]?.id : undefined;
  const inner = s.addBoardCard();
  s.setShares([shareOf(trip, [trip, inner], role)], true);
  vi.advanceTimersByTime(BOARD_SAVE_DELAY);
  return { s, storage, home, homeNote, trip, inner, note, list, item };
}

describe('the store refuses changes to a read-only board', () => {
  it('typing, adding, deleting, ticking, moving, resizing, collapsing, formatting, pasting and importing change nothing', () => {
    const { s, note, list, item } = setup();
    const before = s.getState().board;
    s.setNoteText(note, 'Changed');
    s.setCardTitle(list, 'Changed');
    s.addCard('note');
    s.addColumn();
    s.select(note);
    s.deleteSelection();
    s.deleteCard(note);
    if (item) s.toggleItem(list, item);
    vi.runAllTimers();
    s.cleanUp();
    s.toggleCollapsed(note);
    s.toggleAllCollapsed();
    s.select(note);
    s.nudgeSelection(40, 0);
    s.recolourSelection('butter');
    s.formatBoxes([{ cardId: note }], 'bold');
    s.copySelection();
    s.paste();
    s.duplicate();
    s.importFile('# Imported\n\n- one\n- two\n', 'x.md');
    s.toggleSnap();
    s.renameBoard('Changed');
    vi.runAllTimers();
    expect(s.getState().board).toBe(before);
  });

  it('no delete questions are asked there, and Clean up says nothing moved (code review)', () => {
    const { s, list, item } = setup(undefined);
    if (item) s.toggleItem(list, item); // ticked while still an editor
    vi.runAllTimers();
    s.addColumn();
    const col = s.getState().ui.selection[0];
    s.setShares(s.getState().ui.shares.map((x) => ({ ...x, role: 'view' })), true);
    s.askDeleteCompleted();
    expect(s.getState().ui.deleteCompleted).toBeNull();
    s.select(col);
    s.deleteSelection();
    s.askDeleteColumn(col);
    expect(s.getState().ui.confirm).toBeNull();
    expect(s.cleanUp()).toBe(0);
  });

  it('dragging or resizing a block doesn’t start, and Undo / Redo do nothing', () => {
    const { s, note } = setup(undefined);
    s.setNoteText(note, 'Tent and stove'); // made while still an editor
    s.setShares(s.getState().ui.shares.map((x) => ({ ...x, role: 'view' })), true);
    const before = s.getState().board;
    s.startDrag('card', note, 0, 0);
    expect(s.getState().ui.drag).toBeNull();
    s.startNewDrag('note');
    expect(s.getState().ui.newDrag).toBeNull();
    s.undo();
    s.redo();
    expect(s.getState().board).toBe(before);
  });

  it('a template on an empty read-only board opens as a new board of its own', () => {
    const { s, inner } = setup();
    s.openBoard(inner);
    const before = s.getState().board;
    expect(s.startFromTemplate('weekly')).toBe('opened');
    expect(s.getState().boards.others[inner]).toBe(before);
  });

  it('the boards inside it can’t be changed or deleted, and a sub-board can’t be added', () => {
    const { s, inner, trip } = setup();
    const ws = s.workspace();
    s.deleteBoard(inner);
    expect(s.addBoardCard()).toBe('');
    s.openBoard(inner);
    s.addCard('note');
    expect(s.workspace().boards[inner]).toEqual(ws.boards[inner]);
    expect(s.workspace().boards[trip]).toEqual(ws.boards[trip]);
    expect(Object.keys(s.workspace().boards).sort()).toEqual(Object.keys(ws.boards).sort());
  });

  it('nothing is tidied on it by itself (the heights drawn here could move blocks)', () => {
    const { s, note, list } = setup();
    const before = s.getState().board;
    s.setMeasuredHeight(note, 900);
    s.setMeasuredHeight(list, 900);
    expect(s.getState().board).toBe(before);
  });

  it('the person’s own boards stay fully editable, also from the Journal and Habits panels', () => {
    const { s, home, homeNote, storage } = setup();
    s.openBoard(home);
    s.setNoteText(homeNote, 'Mine');
    expect(s.getState().board.cards[homeNote]).toMatchObject({ text: 'Mine' });
    s.addCard('note');
    s.undo();
    s.openHabits();
    expect(s.addHabit('Run')).toEqual(expect.any(String));
    vi.advanceTimersByTime(BOARD_SAVE_DELAY);
    expect(readWorkspace(storage.data.get(BOARD_KEY)!)!.ws.boards[home].cards[homeNote]).toMatchObject({ text: 'Mine' });
  });

  it('a role change takes effect at once: raised to Can edit, the board can be changed', () => {
    const { s, note } = setup();
    expect(s.viewOnly()).toBe(true);
    s.setShares(s.getState().ui.shares.map((x) => ({ ...x, role: 'edit' })), true);
    expect(s.viewOnly()).toBe(false);
    s.setNoteText(note, 'Now I can');
    expect(s.getState().board.cards[note]).toMatchObject({ text: 'Now I can' });
  });
});

// With the pretend server (as firestore.rules): Alice shares, Bob joins with a role.

const person = (uid: string): Person => ({ uid, name: uid[0].toUpperCase() + uid.slice(1), photo: null });

async function settle() {
  for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(1000);
}

function device(server: ReturnType<typeof memoryServer>, uid: string, storage = memoryStorage(), slow = false) {
  const store = createStore(storage, (fn) => fn());
  const real = server.backendFor(person(uid));
  // `slow`: the server's answer to each save takes 3 seconds to come back, so one can be on its way while more is typed.
  const backend = slow ? { ...real, updateShare: (...a: Parameters<typeof real.updateShare>) => real.updateShare(...a).then((v) => new Promise<typeof v>((r) => setTimeout(() => r(v), 3000))) } : real;
  const states: string[] = [];
  const notices: string[] = [];
  const sharing = startSharing(store, backend, { client: `${uid}-page`, storage, onSaveState: (x) => states.push(x), onNotice: (t) => notices.push(t) });
  return { store, sharing, states, notices, storage, server };
}

async function shared(role: Role, deliver?: (fn: () => void) => void, slow = false) {
  const server = memoryServer(deliver);
  const alice = device(server, 'alice');
  await settle();
  const trip = alice.store.newBoard();
  alice.store.renameBoard('Trip');
  alice.store.addCard('note');
  const note = alice.store.getState().ui.selection[0];
  alice.store.setNoteText(note, 'Tent');
  const shareId = await alice.sharing.share(trip);
  await settle();
  await alice.sharing.makeLink(shareId, role);
  await settle();
  const key = new URL(alice.sharing.link(shareId, 'https://x.test/', role)!).searchParams.get('join')!.split('.')[1];
  const bob = device(server, 'bob', undefined, slow);
  await settle();
  const joined = bob.sharing.join(shareId, key);
  await settle();
  await joined;
  bob.store.openBoard(trip);
  return { server, alice, bob, trip, note, shareId };
}

async function joinAs(alice: ReturnType<typeof device>, shareId: string, uid: string) {
  const key = new URL(alice.sharing.link(shareId, 'https://x.test/', 'view')!).searchParams.get('join')!.split('.')[1];
  const who = device(alice.server, uid);
  const joined = who.sharing.join(shareId, key);
  await settle();
  await joined;
  return who;
}

describe('sharing with a read-only role', () => {
  it('joining with a view link: the page knows the role, and the board is read-only straight away', async () => {
    const { bob } = await shared('view');
    expect(bob.store.getState().ui.shares[0].role).toBe('view');
    expect(bob.store.viewOnly()).toBe(true);
  });

  it('the role is kept on the device, so after a reload (offline too) the board is read-only at once', async () => {
    const { bob, server } = await shared('comment');
    bob.sharing.stop();
    expect(JSON.parse(bob.storage.getItem(sharesKey('bob'))!)[0]).toMatchObject({ role: 'comment' });
    server.control.offline = true;
    const again = device(server, 'bob', bob.storage);
    expect(again.store.getState().ui.shares[0]?.role).toBe('comment');
    expect(again.store.viewOnly()).toBe(true);
  });

  it('a viewer’s changes never reach the server, even a change slipped past the store', async () => {
    const { bob, server, shareId, trip, note } = await shared('view');
    const writes = server.control.writes;
    const rev = server.shares.get(shareId)!.rev;
    // As if the app on Bob's device were changed: the board changed without the store's check.
    bob.store.replaceBoards({ [trip]: { ...bob.store.getState().board, name: 'Hacked' } });
    await settle();
    await settle();
    expect(server.control.writes).toBe(writes);
    expect(server.shares.get(shareId)!.rev).toBe(rev);
    // Put back as the server has it.
    expect(bob.store.getState().board.name).toBe('Trip');
    expect(bob.store.getState().board.cards[note]).toMatchObject({ text: 'Tent' });
    expect(bob.states.at(-1)).toBe('saved');
    expect(bob.notices).toEqual([]); // he was never an editor: nothing of his to tell him about
  });

  it('an editor lowered to viewer mid-edit: the unsent change is put back once, not retried, and they are told plainly', async () => {
    const { alice, bob, server, shareId, note } = await shared('edit');
    // Bob types; before it is sent, Alice makes him a viewer.
    bob.store.setNoteText(note, 'Tent and stove');
    await alice.sharing.setRole(shareId, 'bob', 'view');
    await settle();
    await settle();
    const writes = server.control.writes;
    for (let i = 0; i < 5; i++) await settle();
    expect(server.control.writes).toBe(writes); // not retried
    expect(bob.store.viewOnly()).toBe(true);
    expect(bob.store.getState().board.cards[note]).toMatchObject({ text: 'Tent' });
    expect(server.shares.get(shareId)!.data).not.toContain('stove');
    expect(bob.notices).toEqual([expect.stringMatching(/^Your last change to “Trip” wasn’t saved: you can only view it now\./)]);
    expect(bob.states.at(-1)).toBe('saved'); // no red "couldn't save" banner left behind
  });

  it('an editor lowered before their page hears of it: the server refuses the change; once the role arrives it is put back, told once, not retried', async () => {
    let hold = false;
    const held: (() => void)[] = [];
    const { alice, bob, server, shareId, note } = await shared('edit', (fn) => (hold ? held.push(fn) : setTimeout(fn, 0)));
    hold = true; // Bob's page doesn't hear of the change of role yet
    await alice.sharing.setRole(shareId, 'bob', 'view');
    bob.store.setNoteText(note, 'Tent and stove');
    await settle();
    expect(server.shares.get(shareId)!.data).not.toContain('stove');
    const writes = server.control.writes;
    hold = false;
    held.splice(0).forEach((fn) => fn());
    for (let i = 0; i < 5; i++) await settle();
    expect(server.control.writes).toBe(writes);
    expect(bob.store.getState().board.cards[note]).toMatchObject({ text: 'Tent' });
    expect(bob.notices).toHaveLength(1);
    expect(bob.states.at(-1)).toBe('saved');
  });

  it('lowered while a save is on its way and more is typed: the save that went through stays, only what came after is put back (code review)', async () => {
    const { alice, bob, server, shareId, note } = await shared('edit', undefined, true);
    bob.store.setNoteText(note, 'Tent and stove');
    // Let the first save start, then type more, and lower Bob before anything lands.
    await vi.advanceTimersByTimeAsync(1000);
    bob.store.setNoteText(note, 'Tent and stove and pegs');
    await alice.sharing.setRole(shareId, 'bob', 'view');
    for (let i = 0; i < 5; i++) await settle();
    const online = server.shares.get(shareId)!.data;
    expect(online).toContain('Tent and stove');
    expect(online).not.toContain('pegs');
    // Bob's page shows what the others have, not the board from before the save that went through.
    expect(bob.store.getState().board.cards[note]).toMatchObject({ text: 'Tent and stove' });
    expect(bob.notices).toHaveLength(1);
  });

  it('a viewer who never changed anything is never told their change wasn’t saved (code review)', async () => {
    const { alice, bob, shareId } = await shared('view');
    await joinAs(alice, shareId, 'cat');
    await settle();
    expect(bob.notices).toEqual([]);
  });

  it('raised from viewer to editor while open: their changes are sent', async () => {
    const { alice, bob, server, shareId, note } = await shared('view');
    await alice.sharing.setRole(shareId, 'bob', 'edit');
    await settle();
    expect(bob.store.viewOnly()).toBe(false);
    bob.store.setNoteText(note, 'Tent and stove');
    await settle();
    expect(server.shares.get(shareId)!.data).toContain('stove');
  });
});
