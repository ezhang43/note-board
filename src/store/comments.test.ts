import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageLike } from '../model/persist';
import { serializeWorkspace } from '../model/workspace';
import { memoryServer, type Person, type Role } from './collab';
import { commentsSeenKey, startSharing } from './sharing';
import { createStore } from './store';

// Comments on cards (job 161, PR 4): kept online beside the shared board, never in it (not undoable,
// not in Version history); editors and commenters write them, viewers only read them (D3); only the
// author or the person who shared it deletes one; resolving is for editors and the thread's starter.
// The pretend server (tests and `npm run dev`) checks them as firestore.rules does.

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const person = (uid: string): Person => ({ uid, name: uid[0].toUpperCase() + uid.slice(1), photo: null });

let server: ReturnType<typeof memoryServer>;
beforeEach(() => {
  vi.useFakeTimers();
  server = memoryServer();
});
afterEach(() => vi.useRealTimers());

async function settle() {
  for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(1000);
}

function device(uid: string, storage = memoryStorage()) {
  const store = createStore(storage, (fn) => fn());
  const backend = server.backendFor(person(uid));
  const sharing = startSharing(store, backend, { client: `${uid}-page`, storage });
  return { uid, store, sharing, backend, storage };
}

/** Alice shares "Trip" with a note; the others join with their roles. */
async function setup(roles: Record<string, Role> = { bob: 'comment', cat: 'edit', erin: 'view' }) {
  const alice = device('alice');
  await settle();
  const trip = alice.store.newBoard();
  alice.store.renameBoard('Trip');
  alice.store.addCard('note');
  const note = alice.store.getState().ui.selection[0];
  const shareId = await alice.sharing.share(trip);
  await settle();
  const people: Record<string, ReturnType<typeof device>> = {};
  for (const [uid, role] of Object.entries(roles)) {
    if (!server.shares.get(shareId)!.links[role]) await alice.sharing.makeLink(shareId, role);
    await settle();
    const key = new URL(alice.sharing.link(shareId, 'https://x.test/', role)!).searchParams.get('join')!.split('.')[1];
    const who = device(uid);
    const joined = who.sharing.join(shareId, key);
    await settle();
    await joined;
    people[uid] = who;
  }
  return { alice, trip, note, shareId, ...people } as { alice: ReturnType<typeof device>; trip: string; note: string; shareId: string } & Record<string, ReturnType<typeof device>>;
}

const commentsOn = (d: ReturnType<typeof device>) => d.store.getState().ui.shares[0]?.comments ?? [];

describe('writing comments', () => {
  it('a commenter’s comment reaches everyone, viewers too, with their name from People', async () => {
    const { alice, bob, erin, shareId, note } = await setup();
    await bob.sharing.addComment(shareId, note, '  Worth it with suitcases?  ');
    await settle();
    for (const d of [alice, bob, erin]) expect(commentsOn(d)).toEqual([expect.objectContaining({ card: note, text: 'Worth it with suitcases?', author: 'bob', name: 'Bob', resolved: false })]);
  });

  it('a viewer can’t comment (D3), whatever their app does: the server refuses it too', async () => {
    const { erin, shareId, note } = await setup();
    await expect(erin.sharing.addComment(shareId, note, 'hi')).rejects.toThrow();
    await expect(erin.backend.addComment(shareId, { id: 'x1', card: note, text: 'hi', name: 'Erin', photo: null })).rejects.toMatchObject({ code: 'permission-denied' });
    await settle();
    expect(server.shares.get(shareId)!.comments).toEqual([]);
  });

  it('plain text of 1 to 1,000 characters, on a card of that shared board; the server checks the length and the name', async () => {
    const { bob, shareId, note } = await setup();
    await expect(bob.sharing.addComment(shareId, note, '   ')).rejects.toThrow();
    await expect(bob.sharing.addComment(shareId, note, 'x'.repeat(1001))).rejects.toThrow();
    await expect(bob.sharing.addComment(shareId, 'k_notthere', 'hi')).rejects.toThrow();
    await expect(bob.backend.addComment(shareId, { id: 'x1', card: note, text: 'x'.repeat(1001), name: 'Bob', photo: null })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(bob.backend.addComment(shareId, { id: 'x2', card: note, text: 'hi', name: 'Alice', photo: null })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(bob.backend.addComment(shareId, { id: 'x3', card: '../x', text: 'hi', name: 'Bob', photo: null })).rejects.toMatchObject({ code: 'permission-denied' });
    await bob.sharing.addComment(shareId, note, 'x'.repeat(1000));
    expect(server.shares.get(shareId)!.comments).toHaveLength(1);
  });

  it('comments are not part of the board: not undoable, never saved with it (so not in Version history)', async () => {
    const { alice, bob, shareId, note } = await setup();
    const before = serializeWorkspace(alice.store.workspace());
    const rev = server.shares.get(shareId)!.rev;
    await bob.sharing.addComment(shareId, note, 'hello');
    await settle();
    // Nothing on the board changed, so nothing was saved; and undo doesn't take the comment away.
    expect(serializeWorkspace(alice.store.workspace())).toBe(before);
    expect(server.shares.get(shareId)!.rev).toBe(rev);
    alice.store.undo();
    bob.store.undo();
    await settle();
    expect(commentsOn(alice)).toHaveLength(1);
    expect(commentsOn(bob)).toHaveLength(1);
    expect(server.shares.get(shareId)!.data).not.toContain('hello');
  });

  it('only on shared boards (D6): a card of a board that isn’t shared can’t have comments', async () => {
    const { alice, shareId } = await setup({});
    alice.store.openBoard(alice.store.getState().boards.home);
    alice.store.addCard('note');
    const mine = alice.store.getState().ui.selection[0];
    await expect(alice.sharing.addComment(shareId, mine, 'hi')).rejects.toThrow();
  });
});

describe('resolving and reopening', () => {
  it('a commenter resolves a thread they started, not someone else’s; an editor resolves any; replying reopens it', async () => {
    const { alice, bob, cat, shareId, note } = await setup();
    await cat.sharing.addComment(shareId, note, 'Started by Cat');
    await settle();
    await expect(bob.sharing.resolve(shareId, note, true)).rejects.toThrow();
    // Not even by talking to the server directly.
    const first = server.shares.get(shareId)!.comments[0];
    await expect(bob.backend.resolveComment(shareId, first.id, true)).rejects.toMatchObject({ code: 'permission-denied' });
    await alice.sharing.resolve(shareId, note, true);
    await settle();
    expect(bob.sharing.thread(shareId, note).resolved).toBe(true);
    await bob.sharing.addComment(shareId, note, 'One more thing');
    await settle();
    expect(alice.sharing.thread(shareId, note).resolved).toBe(false);
    // Reopened by an editor.
    await cat.sharing.resolve(shareId, note, true);
    await settle();
    await cat.sharing.resolve(shareId, note, false);
    await settle();
    expect(bob.sharing.thread(shareId, note).resolved).toBe(false);
  });

  it('a commenter resolves their own thread; a viewer can’t resolve', async () => {
    const { bob, erin, shareId, note } = await setup();
    await bob.sharing.addComment(shareId, note, 'Mine');
    await settle();
    await expect(erin.sharing.resolve(shareId, note, true)).rejects.toThrow();
    await bob.sharing.resolve(shareId, note, true);
    await settle();
    expect(erin.sharing.thread(shareId, note).resolved).toBe(true);
  });
});

describe('deleting', () => {
  it('only its author or the person who shared the board can delete a comment', async () => {
    const { alice, bob, cat, shareId, note } = await setup();
    await bob.sharing.addComment(shareId, note, 'one');
    await bob.sharing.addComment(shareId, note, 'two');
    await settle();
    const [one, two] = server.shares.get(shareId)!.comments;
    await expect(cat.sharing.deleteComment(shareId, one.id)).rejects.toMatchObject({ code: 'permission-denied' });
    await bob.sharing.deleteComment(shareId, one.id);
    await alice.sharing.deleteComment(shareId, two.id);
    await settle();
    expect(server.shares.get(shareId)!.comments).toEqual([]);
    expect(commentsOn(cat)).toEqual([]);
  });

  it('a deleted card’s comments are kept (hidden), and show again when it comes back', async () => {
    const { alice, bob, shareId, note, trip } = await setup();
    await bob.sharing.addComment(shareId, note, 'keep me');
    await settle();
    alice.store.deleteCard(note);
    await settle();
    expect(server.shares.get(shareId)!.comments).toHaveLength(1);
    expect(bob.store.workspace().boards[trip].cards[note]).toBeUndefined();
    alice.store.undo();
    await settle();
    expect(bob.store.workspace().boards[trip].cards[note]).toBeDefined();
    expect(bob.sharing.thread(shareId, note).comments).toHaveLength(1);
  });

  it('deleting the shared board deletes its comments; a removed person stops getting them', async () => {
    const { alice, bob, cat, shareId, note } = await setup();
    await bob.sharing.addComment(shareId, note, 'hi');
    await settle();
    await alice.sharing.removePerson(shareId, 'cat');
    await settle();
    await bob.sharing.addComment(shareId, note, 'after Cat left');
    await settle();
    expect(cat.store.getState().ui.shares).toEqual([]);
    await expect(cat.backend.addComment(shareId, { id: 'x', card: note, text: 'hi', name: 'Cat', photo: null })).rejects.toMatchObject({ code: 'permission-denied' });
    await alice.sharing.deleteShare(shareId);
    await settle();
    expect(server.shares.has(shareId)).toBe(false);
  });
});

describe('the “new” dot, remembered on this device (D2)', () => {
  it('seen up to the newest comment when a thread is opened; kept on the device for that person', async () => {
    const { alice, bob, shareId, note } = await setup();
    await bob.sharing.addComment(shareId, note, 'hi');
    await settle();
    expect(alice.store.getState().ui.shares[0].seen?.[note]).toBeUndefined();
    alice.sharing.markSeen(shareId, note);
    const at = server.shares.get(shareId)!.comments[0].at;
    expect(alice.store.getState().ui.shares[0].seen?.[note]).toBe(at);
    expect(JSON.parse(alice.storage.data.get(commentsSeenKey('alice'))!)).toEqual({ [`${shareId}/${note}`]: at });
    // After a reload it is still seen.
    alice.sharing.stop();
    const again = device('alice', alice.storage);
    await settle();
    expect(again.store.getState().ui.shares[0].seen?.[note]).toBe(at);
  });
});
