import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageLike } from '../model/persist';
import * as B from '../model/board';
import { createBoardCard } from '../model/cards';
import { serializeShare } from '../model/sharing';
import type { Board, NoteCard } from '../model/types';
import { memoryServer, type Person } from './collab';
import { startSharing } from './sharing';
import { createStore, type Store } from './store';

// Sharing a board and editing it together (owner request, 2026-10-05), with a pretend server.

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

/** Lets uploads, the pretend network and debounces all run. */
async function settle() {
  for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(1000);
}

function device(uid: string, storage = memoryStorage()) {
  const store = createStore(storage, (fn) => fn());
  const notices: string[] = [];
  const sharing = startSharing(store, server.backendFor(person(uid)), { client: `${uid}-page-${Math.random()}`, storage, onNotice: (t) => notices.push(t) });
  return { store, sharing, storage, notices };
}

/** Alice makes a board "Trip" with a note and a sub-board inside, then shares it. */
async function aliceShares() {
  const alice = device('alice');
  await settle();
  const trip = alice.store.newBoard();
  alice.store.renameBoard('Trip');
  alice.store.addCard('note');
  const sub = alice.store.addBoardCard();
  const shareId = await alice.sharing.share(trip);
  await settle();
  return { alice, trip, sub, shareId };
}

const notes = (s: Store, boardId: string) => {
  const b = s.workspace().boards[boardId];
  return Object.values(b?.cards ?? {}).filter((c): c is NoteCard => c.kind === 'note');
};
const shareInfo = (s: Store) => s.getState().ui.shares;

describe('sharing a board', () => {
  it('puts the board and the boards inside it online, apart from the owner’s other boards', async () => {
    const { alice, trip, sub, shareId } = await aliceShares();
    expect(server.shares.get(shareId)?.root).toBe(trip);
    expect(alice.sharing.isShared(trip)).toBe(true);
    expect(alice.sharing.isShared(sub)).toBe(true);
    expect(alice.sharing.isShared(alice.store.workspace().home)).toBe(false);
    expect(shareInfo(alice.store)).toMatchObject([{ id: shareId, root: trip, owner: true }]);
    expect(shareInfo(alice.store)[0].boards.sort()).toEqual([sub, trip].sort());
  });

  it('the home board can’t be shared', async () => {
    const alice = device('alice');
    await settle();
    await expect(alice.sharing.share(alice.store.workspace().home)).rejects.toThrow();
  });

  it('someone with the link gets the board and the boards inside it', async () => {
    const { alice, trip, sub, shareId } = await aliceShares();
    const bob = device('bob');
    await settle();
    const link = alice.sharing.link(shareId, 'https://x.test/note-board/')!;
    const key = new URL(link).searchParams.get('join')!.split('.')[1];
    const joined = bob.sharing.join(shareId, key);
    await settle();
    const root = await joined;
    expect(root).toBe(trip);
    expect(bob.store.workspace().boards[trip].name).toBe('Trip');
    expect(bob.store.workspace().boards[sub]).toBeDefined();
    expect(shareInfo(bob.store)).toMatchObject([{ id: shareId, owner: false }]);
    expect(shareInfo(alice.store)[0].people.map((p) => p.name)).toEqual(['Alice', 'Bob']);
  });

  it('a wrong or turned-off link is refused', async () => {
    const { alice, shareId } = await aliceShares();
    const bob = device('bob');
    await expect(bob.sharing.join(shareId, 'wrongkey')).rejects.toThrow();
    const key = server.shares.get(shareId)!.link!;
    await alice.sharing.setLinkOn(shareId, false);
    await expect(bob.sharing.join(shareId, key)).rejects.toThrow();
    await alice.sharing.setLinkOn(shareId, true);
    expect(server.shares.get(shareId)!.link).not.toBe(key);
  });
});

async function together() {
  const shared = await aliceShares();
  const bob = device('bob');
  await settle();
  const joined = bob.sharing.join(shared.shareId, server.shares.get(shared.shareId)!.link!);
  await settle();
  await joined;
  return { ...shared, bob };
}

describe('editing together', () => {
  it('edits made at the same moment by two people are both kept, on both screens', async () => {
    const { alice, bob, trip } = await together();
    bob.store.openBoard(trip);
    const noteId = notes(alice.store, trip)[0].id;
    alice.store.openBoard(trip);
    alice.store.setNoteText(noteId, 'Pack the tent');
    bob.store.addCard('note');
    await settle();
    for (const s of [alice.store, bob.store]) {
      expect(notes(s, trip)).toHaveLength(2);
      expect(notes(s, trip).find((n) => n.id === noteId)?.text).toBe('Pack the tent');
    }
    expect(alice.store.workspace().boards[trip]).toEqual(bob.store.workspace().boards[trip]);
  });

  it('a sub-board added inside a shared board is shared too', async () => {
    const { alice, bob, trip } = await together();
    bob.store.openBoard(trip);
    const added = bob.store.addBoardCard();
    await settle();
    expect(alice.store.workspace().boards[added]).toBeDefined();
    expect(alice.sharing.isShared(added)).toBe(true);
  });

  it('the owner’s own boards are never sent to the people a board is shared with', async () => {
    const { alice, bob } = await together();
    const secret = alice.store.newBoard();
    alice.store.renameBoard('Diary');
    await settle();
    expect(bob.store.workspace().boards[secret]).toBeUndefined();
  });

  it('changes made without a connection are sent, and combined, once it is back', async () => {
    const { alice, bob, trip } = await together();
    alice.store.openBoard(trip);
    bob.store.openBoard(trip);
    server.control.offline = true;
    alice.store.renameBoard('Trip to Rome');
    await settle();
    server.control.offline = false;
    bob.store.addCard('note');
    alice.sharing.retry();
    await settle();
    for (const s of [alice.store, bob.store]) {
      expect(s.workspace().boards[trip].name).toBe('Trip to Rome');
      expect(notes(s, trip)).toHaveLength(2);
    }
  });

  it('after a reload, changes made here before it are combined with everyone else’s', async () => {
    const { alice, bob, trip, shareId } = await together();
    bob.store.openBoard(trip);
    // Bob edits offline, then closes the page.
    server.control.offline = true;
    bob.store.addCard('note');
    await settle();
    bob.sharing.stop();
    bob.store.flush();
    server.control.offline = false;
    alice.store.openBoard(trip);
    alice.store.renameBoard('Trip to Rome');
    await settle();
    // Bob opens the page again on the same device.
    const again = device('bob', bob.storage);
    await settle();
    expect(again.sharing.shareOf(trip)).toBe(shareId);
    for (const s of [alice.store, again.store]) {
      expect(s.workspace().boards[trip].name).toBe('Trip to Rome');
      expect(notes(s, trip)).toHaveLength(2);
    }
  });
});

describe('leaving and removing', () => {
  it('the owner can remove someone: the board goes from their screen', async () => {
    const { alice, bob, trip, sub, shareId } = await together();
    bob.store.openBoard(sub);
    await alice.sharing.removePerson(shareId, 'bob');
    await settle();
    expect(bob.store.workspace().boards[trip]).toBeUndefined();
    expect(bob.store.workspace().boards[sub]).toBeUndefined();
    expect(bob.store.getState().boards.open).toBe(bob.store.workspace().home);
    expect(shareInfo(bob.store)).toEqual([]);
    expect(bob.notices.join()).toContain('Trip');
    expect(shareInfo(alice.store)[0].people.map((p) => p.name)).toEqual(['Alice']);
  });

  it('someone can leave a board shared with them', async () => {
    const { alice, bob, trip, shareId } = await together();
    await bob.sharing.leave(shareId);
    await settle();
    expect(bob.store.workspace().boards[trip]).toBeUndefined();
    expect(shareInfo(alice.store)[0].people.map((p) => p.name)).toEqual(['Alice']);
    expect(alice.store.workspace().boards[trip]).toBeDefined();
  });

  it('the owner deleting a shared board deletes it for everyone', async () => {
    const { alice, bob, trip, shareId } = await together();
    await alice.sharing.deleteShare(shareId);
    await settle();
    expect(bob.store.workspace().boards[trip]).toBeUndefined();
    expect(alice.store.workspace().boards[trip]).toBeUndefined();
    expect(server.shares.has(shareId)).toBe(false);
  });

  it('only the owner can remove people, turn the link off or delete', async () => {
    const { bob, shareId } = await together();
    await expect(bob.sharing.removePerson(shareId, 'alice')).rejects.toThrow();
    await expect(bob.sharing.setLinkOn(shareId, false)).rejects.toThrow();
    await expect(bob.sharing.deleteShare(shareId)).rejects.toThrow();
  });
});

describe('a busy board', () => {
  it('two people adding and typing in quick turns end up with the same board, nothing lost', async () => {
    const { alice, bob, trip } = await together();
    alice.store.openBoard(trip);
    bob.store.openBoard(trip);
    for (let i = 0; i < 10; i++) {
      alice.store.addCard('note');
      await vi.advanceTimersByTimeAsync(300 + ((i * 137) % 700));
      bob.store.addCard('note');
      const last = notes(bob.store, trip).at(-1)!;
      bob.store.setNoteText(last.id, `bob ${i}`);
      await vi.advanceTimersByTimeAsync((i * 251) % 900);
    }
    await settle();
    await settle();
    expect(notes(alice.store, trip)).toHaveLength(21);
    expect(alice.store.workspace().boards[trip]).toEqual(bob.store.workspace().boards[trip]);
    expect(notes(alice.store, trip).filter((n) => n.text.startsWith('bob'))).toHaveLength(10);
  });
});

describe('review fixes (2026-10-05)', () => {
  it('removing someone changes the link, so the copy they have stops working', async () => {
    const { alice, bob, shareId } = await together();
    const oldKey = server.shares.get(shareId)!.link!;
    await alice.sharing.removePerson(shareId, 'bob');
    await settle();
    expect(server.shares.get(shareId)!.link).not.toBe(oldKey);
    await expect(bob.sharing.join(shareId, oldKey)).rejects.toThrow();
  });

  it('a refused save isn’t tried again and again: it waits for the next change', async () => {
    const { alice, trip } = await together();
    alice.store.openBoard(trip);
    server.control.refuse = true;
    const before = server.control.writes;
    alice.store.renameBoard('Too big');
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.control.writes - before).toBe(1);
    server.control.refuse = false;
    alice.store.renameBoard('Fine now');
    await settle();
    expect(server.shares.get([...server.shares.keys()][0])!.data).toContain('Fine now');
  });

  it('the screen’s list of a shared board’s boards drops a board deleted from it', async () => {
    const { alice, trip, sub } = await together();
    alice.store.openBoard(trip);
    alice.store.deleteBoard(sub);
    await settle();
    expect(shareInfo(alice.store)[0].boards).toEqual([trip]);
  });
});

describe('security review fixes: a share never takes this person’s own boards (2026-10-05)', () => {
  const mallory = person('mallory');
  const opening = (b: Board, to: string) => B.addCard(b, createBoardCard(to, `card-${to}`), { type: 'loose', x: 0, y: 0 });
  const named = (name: string) => ({ ...B.createBoard(), name });

  /** Bob, with a private board "Diary" (one note in it). */
  async function bobWithDiary() {
    const bob = device('bob');
    await settle();
    const diary = bob.store.newBoard();
    bob.store.renameBoard('Diary');
    bob.store.addCard('note');
    bob.store.openBoard(bob.store.workspace().home);
    const before = bob.store.workspace().boards[diary];
    return { bob, diary, before };
  }

  /** Mallory puts a share online as she likes (any root, any boards) and Bob opens its link. */
  async function malloryShares(root: string, boards: Record<string, Board>) {
    await server.server.createShare(mallory, 'sbad', root, 'badkey', serializeShare(Object.keys(boards)[0], boards), 'mallory-page');
  }

  it('a share whose starting board isn’t one of its boards can’t be opened, and takes nothing', async () => {
    const { bob, diary, before } = await bobWithDiary();
    await malloryShares(diary, { m1: named('Bait') });
    const joined = bob.sharing.join('sbad', 'badkey');
    joined.catch(() => {});
    await settle();
    await expect(joined).rejects.toThrow();
    expect(bob.sharing.isShared(diary)).toBe(false);
    expect(bob.store.workspace().boards[diary]).toEqual(before);
    expect(bob.store.workspace().boards.m1).toBeUndefined();
  });

  it('a board card in the share pointing at one of their boards doesn’t take that board in', async () => {
    const { bob, diary, before } = await bobWithDiary();
    await malloryShares('m1', { m1: opening(named('Bait'), diary) });
    const joined = bob.sharing.join('sbad', 'badkey');
    await settle();
    expect(await joined).toBe('m1');
    expect(bob.sharing.isShared(diary)).toBe(false);
    expect(shareInfo(bob.store)[0].boards).toEqual(['m1']);
    // Bob edits the shared board: his diary is still not sent.
    bob.store.openBoard('m1');
    bob.store.addCard('note');
    await settle();
    expect(server.shares.get('sbad')!.data).not.toContain('Diary');
    // Mallory deletes it: Bob’s diary stays.
    await server.server.deleteShare(mallory, 'sbad');
    await settle();
    expect(bob.store.workspace().boards[diary]).toEqual(before);
  });

  it('a board in the share with the id of one of their boards doesn’t replace it', async () => {
    const { bob, diary, before } = await bobWithDiary();
    await malloryShares('m1', { m1: opening(named('Bait'), diary), [diary]: named('Overwritten') });
    const joined = bob.sharing.join('sbad', 'badkey');
    await settle();
    await joined;
    expect(bob.store.workspace().boards[diary]).toEqual(before);
    expect(bob.sharing.isShared(diary)).toBe(false);
  });

  it('a card pointing at one of their boards, added online later, doesn’t take it in either', async () => {
    const { bob, diary, before } = await bobWithDiary();
    await malloryShares('m1', { m1: named('Bait') });
    const joined = bob.sharing.join('sbad', 'badkey');
    await settle();
    await joined;
    const s = server.shares.get('sbad')!;
    await server.server.write(mallory, 'sbad', serializeShare('m1', { m1: opening(named('Bait'), diary), [diary]: named('Overwritten') }), 'mallory-page', s.rev);
    await settle();
    expect(bob.sharing.isShared(diary)).toBe(false);
    expect(bob.store.workspace().boards[diary]).toEqual(before);
    expect(bob.store.workspace().boards.m1.cards[`card-${diary}`]).toBeDefined();
  });
});

describe('security review fixes: removing someone and opening a page again (2026-10-05)', () => {
  it('removing someone and changing the link happen in one go: the old link never lets them back in', async () => {
    const { alice, shareId } = await together();
    const oldKey = server.shares.get(shareId)!.link!;
    // Bob tries the old link at every step of Alice’s change.
    const bobBackend = server.backendFor(person('bob'));
    const original = { ...server.server };
    for (const step of ['removePerson', 'setLink'] as const) {
      (server.server as unknown as Record<string, unknown>)[step] = async (...args: unknown[]) => {
        await (original[step] as (...a: unknown[]) => Promise<void>)(...args);
        await bobBackend.join(shareId, oldKey).catch(() => {});
      };
    }
    await alice.sharing.removePerson(shareId, 'bob');
    await settle();
    expect(server.shares.get(shareId)!.people.map((p) => p.uid)).toEqual(['alice']);
    expect(server.shares.get(shareId)!.link).not.toBe(oldKey);
  });

  it('if removing someone fails, nothing changes', async () => {
    const { alice, shareId } = await together();
    const oldKey = server.shares.get(shareId)!.link!;
    server.control.offline = true;
    await expect(alice.sharing.removePerson(shareId, 'bob')).rejects.toThrow();
    server.control.offline = false;
    expect(server.shares.get(shareId)!.people.map((p) => p.uid)).toEqual(['alice', 'bob']);
    expect(server.shares.get(shareId)!.link).toBe(oldKey);
  });

  it('on a page opened again, the shared boards are known as shared straight away, even when the list can’t be read', async () => {
    const { bob, trip, sub } = await together();
    bob.sharing.stop();
    bob.store.flush();
    server.control.offline = true;
    const again = device('bob', bob.storage);
    // Before anything arrives: the person’s own boards must not take these as theirs.
    expect(again.sharing.isShared(trip)).toBe(true);
    expect(again.sharing.isShared(sub)).toBe(true);
    await settle();
    expect(again.sharing.isShared(trip)).toBe(true);
  });

  it('shared boards missing on a page opened again are never deleted for everyone: they come back', async () => {
    const { alice, bob, trip, sub, shareId } = await together();
    bob.sharing.stop();
    // The boards went from Bob’s device while the page was closed.
    bob.store.replaceBoards({ [trip]: null, [sub]: null });
    bob.store.flush();
    const again = device('bob', bob.storage);
    await settle();
    await settle();
    expect(server.shares.get(shareId)!.data).toContain('Trip');
    expect(alice.store.workspace().boards[sub]).toBeDefined();
    expect(again.store.workspace().boards[trip]?.name).toBe('Trip');
  });
});
