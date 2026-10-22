import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageLike } from '../model/persist';
import { memoryServer, type Person, type Role } from './collab';
import { startSharing } from './sharing';
import { createStore } from './store';

// Roles on shared boards (job 161, PR 2): the three links in the Share panel, joining with the role
// of the link, roles in People, and the pretend server (tests and `npm run dev`) checking them as
// firestore.rules does.

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
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

function device(uid: string) {
  const storage = memoryStorage();
  const store = createStore(storage, (fn) => fn());
  const states: string[] = [];
  const sharing = startSharing(store, server.backendFor(person(uid)), { client: `${uid}-page`, storage, onSaveState: (s) => states.push(s) });
  return { store, sharing, states };
}

/** Alice shares a board "Trip" with a note. */
async function aliceShares() {
  const alice = device('alice');
  await settle();
  const trip = alice.store.newBoard();
  alice.store.renameBoard('Trip');
  alice.store.addCard('note');
  const shareId = await alice.sharing.share(trip);
  await settle();
  return { alice, trip, shareId };
}

const links = (id: string) => server.shares.get(id)!.links;
const roleOf = (id: string, uid: string) => server.shares.get(id)!.people.find((p) => p.uid === uid)?.role;

/** `uid` opens the link of `role` (made first if it isn't yet). */
async function joins(alice: ReturnType<typeof device>, shareId: string, uid: string, role: Role, who = device(uid)) {
  if (!links(shareId)[role]) await alice.sharing.makeLink(shareId, role);
  await settle();
  const link = alice.sharing.link(shareId, 'https://x.test/note-board/', role)!;
  const key = new URL(link).searchParams.get('join')!.split('.')[1];
  const joined = who.sharing.join(shareId, key);
  await settle();
  await joined;
  return who;
}

describe('the three links', () => {
  it('a new share has only an edit link; the person who shared it is an editor', async () => {
    const { alice, shareId } = await aliceShares();
    expect(links(shareId)).toMatchObject({ comment: null, view: null, roles: false });
    expect(links(shareId).edit).toEqual(expect.any(String));
    expect(alice.store.getState().ui.shares[0].people).toEqual([{ ...person('alice'), role: 'edit' }]);
    expect(alice.sharing.link(shareId, 'https://x.test/', 'comment')).toBeNull();
    expect(alice.sharing.link(shareId, 'https://x.test/', 'edit')).toContain(`?join=${shareId}.`);
  });

  it('the first comment or view link changes the edit link once (D1); later ones don’t', async () => {
    const { alice, shareId } = await aliceShares();
    const firstEdit = links(shareId).edit;
    await alice.sharing.makeLink(shareId, 'comment');
    await settle();
    const { edit, comment, roles } = links(shareId);
    expect(comment).toEqual(expect.any(String));
    expect(edit).not.toBe(firstEdit);
    expect(edit).toEqual(expect.any(String));
    expect(roles).toBe(true);
    await alice.sharing.makeLink(shareId, 'view');
    await settle();
    expect(links(shareId)).toMatchObject({ edit, comment, view: expect.any(String) });
    // The page knows the links too.
    expect(alice.store.getState().ui.shares[0].links).toEqual(links(shareId));
  });

  it('the first comment link while the edit link is off leaves it off', async () => {
    const { alice, shareId } = await aliceShares();
    await alice.sharing.linksOff(shareId);
    await alice.sharing.makeLink(shareId, 'view');
    await settle();
    expect(links(shareId)).toMatchObject({ edit: null, comment: null, view: expect.any(String), roles: true });
  });

  it('“Turn links off” turns all three off, and none of them lets anyone in', async () => {
    const { alice, shareId } = await aliceShares();
    await alice.sharing.makeLink(shareId, 'comment');
    await alice.sharing.makeLink(shareId, 'view');
    const old = { ...links(shareId) };
    await alice.sharing.linksOff(shareId);
    await settle();
    expect(links(shareId)).toMatchObject({ edit: null, comment: null, view: null, roles: true });
    const bob = device('bob');
    for (const key of [old.edit, old.comment, old.view]) await expect(bob.sharing.join(shareId, key!)).rejects.toThrow();
  });

  it('only the person who shared it makes links or turns them off', async () => {
    const { alice, shareId } = await aliceShares();
    const bob = await joins(alice, shareId, 'bob', 'edit');
    await expect(bob.sharing.makeLink(shareId, 'view')).rejects.toThrow();
    await expect(bob.sharing.linksOff(shareId)).rejects.toThrow();
    expect(links(shareId).view).toBeNull();
  });

  it('editors see the links; commenters and viewers see none', async () => {
    const { alice, shareId } = await aliceShares();
    await alice.sharing.makeLink(shareId, 'comment');
    await alice.sharing.makeLink(shareId, 'view');
    const bob = await joins(alice, shareId, 'bob', 'edit');
    const cat = await joins(alice, shareId, 'cat', 'comment');
    const dan = await joins(alice, shareId, 'dan', 'view');
    expect(bob.store.getState().ui.shares[0].links).toEqual(links(shareId));
    for (const p of [cat, dan]) expect(p.store.getState().ui.shares[0].links).toMatchObject({ edit: null, comment: null, view: null });
  });
});

describe('joining with a role', () => {
  it('each link gives its role, shown in everyone’s People list', async () => {
    const { alice, shareId } = await aliceShares();
    await joins(alice, shareId, 'bob', 'edit');
    await joins(alice, shareId, 'cat', 'comment');
    await joins(alice, shareId, 'dan', 'view');
    await settle();
    expect(alice.store.getState().ui.shares[0].people.map((p) => [p.uid, p.role])).toEqual([
      ['alice', 'edit'],
      ['bob', 'edit'],
      ['cat', 'comment'],
      ['dan', 'view'],
    ]);
  });

  it('opening a lower-role link never lowers someone’s role; a higher one raises it', async () => {
    const { alice, shareId } = await aliceShares();
    const bob = await joins(alice, shareId, 'bob', 'edit');
    await joins(alice, shareId, 'bob', 'view', bob);
    expect(roleOf(shareId, 'bob')).toBe('edit');
    const cat = await joins(alice, shareId, 'cat', 'comment');
    await joins(alice, shareId, 'cat', 'view', cat);
    expect(roleOf(shareId, 'cat')).toBe('comment');
    // On a new device too (the share isn't on it yet): the server keeps the higher role.
    await server.backendFor(person('bob')).join(shareId, links(shareId).view!);
    await server.backendFor(person('cat')).join(shareId, links(shareId).view!);
    expect([roleOf(shareId, 'bob'), roleOf(shareId, 'cat')]).toEqual(['edit', 'comment']);
    // A viewer given the edit link becomes an editor, on the device that already has the board.
    const dan = await joins(alice, shareId, 'dan', 'view');
    await joins(alice, shareId, 'dan', 'edit', dan);
    expect(roleOf(shareId, 'dan')).toBe('edit');
    expect(dan.store.getState().ui.shares[0].links.edit).toBe(links(shareId).edit);
  });

  it('a link that doesn’t work, opened on a device that already has the board, still just opens it', async () => {
    const { alice, trip, shareId } = await aliceShares();
    const dan = await joins(alice, shareId, 'dan', 'view');
    await alice.sharing.linksOff(shareId);
    await settle();
    await expect(dan.sharing.join(shareId, 'old-key-that-is-off')).resolves.toBe(trip);
    expect(roleOf(shareId, 'dan')).toBe('view');
  });

  it('the person who shared it stays an editor whatever link they open', async () => {
    const { alice, shareId } = await aliceShares();
    await alice.sharing.makeLink(shareId, 'view');
    const again = device('alice');
    await settle();
    await joins(alice, shareId, 'alice', 'view', again);
    expect(roleOf(shareId, 'alice')).toBe('edit');
  });
});

describe('changing someone’s role', () => {
  it('the person who shared it changes a role; it shows for everyone', async () => {
    const { alice, shareId } = await aliceShares();
    const bob = await joins(alice, shareId, 'bob', 'view');
    await alice.sharing.setRole(shareId, 'bob', 'edit');
    await settle();
    expect(roleOf(shareId, 'bob')).toBe('edit');
    expect(bob.store.getState().ui.shares[0].people.find((p) => p.uid === 'bob')?.role).toBe('edit');
  });

  it('nobody else can, not even an editor, and nobody can change the role of the person who shared it', async () => {
    const { alice, shareId } = await aliceShares();
    const bob = await joins(alice, shareId, 'bob', 'edit');
    await joins(alice, shareId, 'cat', 'view');
    await expect(bob.sharing.setRole(shareId, 'cat', 'edit')).rejects.toThrow();
    await expect(bob.sharing.setRole(shareId, 'bob', 'view')).rejects.toThrow();
    await expect(alice.sharing.setRole(shareId, 'alice', 'view')).rejects.toThrow();
    expect(roleOf(shareId, 'cat')).toBe('view');
    expect(roleOf(shareId, 'alice')).toBe('edit');
  });

  it('lowering someone changes the links of the roles above their new one (they may know them)', async () => {
    const { alice, shareId } = await aliceShares();
    await alice.sharing.makeLink(shareId, 'comment');
    await alice.sharing.makeLink(shareId, 'view');
    await joins(alice, shareId, 'bob', 'edit');
    const before = { ...links(shareId) };
    await alice.sharing.setRole(shareId, 'bob', 'comment');
    expect(links(shareId).edit).not.toBe(before.edit);
    expect(links(shareId)).toMatchObject({ comment: before.comment, view: before.view });
    const mid = { ...links(shareId) };
    await alice.sharing.setRole(shareId, 'bob', 'view');
    expect(links(shareId).edit).not.toBe(mid.edit);
    expect(links(shareId).comment).not.toBe(mid.comment);
    expect(links(shareId).view).toBe(mid.view);
    // Raising changes nothing.
    const low = { ...links(shareId) };
    await alice.sharing.setRole(shareId, 'bob', 'edit');
    expect(links(shareId)).toEqual(low);
  });

  it('a link that is off stays off when someone is lowered', async () => {
    const { alice, shareId } = await aliceShares();
    await joins(alice, shareId, 'bob', 'edit');
    await alice.sharing.linksOff(shareId);
    await alice.sharing.setRole(shareId, 'bob', 'view');
    expect(links(shareId)).toMatchObject({ edit: null, comment: null, view: null });
  });
});

describe('removing someone', () => {
  it('changes every link that is on (PR 1 review), and leaves those that are off', async () => {
    const { alice, shareId } = await aliceShares();
    await alice.sharing.makeLink(shareId, 'view');
    await joins(alice, shareId, 'bob', 'view');
    const before = { ...links(shareId) };
    await alice.sharing.removePerson(shareId, 'bob');
    expect(roleOf(shareId, 'bob')).toBeUndefined();
    expect(links(shareId).edit).not.toBe(before.edit);
    expect(links(shareId).view).not.toBe(before.view);
    expect(links(shareId).comment).toBeNull();
    const bob = device('bob');
    for (const key of [before.edit, before.view]) await expect(bob.sharing.join(shareId, key!)).rejects.toThrow();
  });
});

describe('a viewer or commenter changing the board (until read-only boards, PR 3)', () => {
  it('is refused online: the save shows as failed once, the board online is unchanged, and it isn’t tried again and again', async () => {
    const { alice, trip, shareId } = await aliceShares();
    const dan = await joins(alice, shareId, 'dan', 'view');
    const before = server.shares.get(shareId)!.data;
    const writes = server.control.writes;
    dan.store.openBoard(trip);
    dan.store.addCard('note');
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.shares.get(shareId)!.data).toBe(before);
    expect(dan.states.at(-1)).toBe('failed');
    expect(server.control.writes - writes).toBe(1);
    // Alice’s next change reaches Dan; his page tries once more, then waits again.
    alice.store.openBoard(trip);
    alice.store.addCard('note');
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.control.writes - writes).toBeLessThanOrEqual(3);
  });
});
