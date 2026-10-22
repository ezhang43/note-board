// What firestore.rules lets each person read and write, tested on the local Firestore emulator.
// Every write uses the shapes src/sync/firebase.ts writes. Run with `npm run test:rules`.
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { describe, it } from 'vitest';
import { ONLINE_LIMIT } from '../src/store/sync';
import { as, asUnverified, emailOf, seed, signedOut, useRulesEnv } from './env';

useRulesEnv();

const board = (data = '{}') => ({ data, client: 'p', updatedAt: serverTimestamp() });
const version = { savedAt: 1, cards: 0, columns: 0 };
const share = { owner: 'alice', root: 'b1', link: 'k', data: '{}', client: 'p', rev: 1, updatedAt: 1 };
const member = (key: string | null = 'k') => ({ name: 'A', photo: null, key, joinedAt: serverTimestamp() });

/** alice's share s1, with alice (and, if asked, bob) as its people. */
const seedShare = (more: Record<string, object> = {}) =>
  seed({ 'shared/s1': share, 'shared/s1/members/alice': { name: 'A', photo: null, key: 'k', joinedAt: 1 }, ...more });
const withBob = { 'shared/s1/members/bob': { name: 'B', photo: null, key: 'k', joinedAt: 1 } };

/** alice shares a board, as createShare does: the share, her member record and her list entry, together. */
function createShare(db: Firestore, s: object = share, withMember = true) {
  const b = writeBatch(db);
  b.set(doc(db, 'shared/s1'), { ...s, updatedAt: serverTimestamp() });
  if (withMember) b.set(doc(db, 'shared/s1/members/alice'), member());
  b.set(doc(db, 'boards/alice/shared/s1'), { joinedAt: serverTimestamp() });
  return b.commit();
}

/** bob joins with a key, as join does. */
function join(db: Firestore, uid: string, key: string, extra: object = {}) {
  const b = writeBatch(db);
  b.set(doc(db, `shared/s1/members/${uid}`), { ...member(key), ...extra });
  b.set(doc(db, `boards/${uid}/shared/s1`), { joinedAt: serverTimestamp() });
  return b.commit();
}

describe('own board (boards/{uid})', () => {
  it('its owner can save, read and delete it', async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(doc(db, 'boards/alice'), board()));
    await assertSucceeds(getDoc(doc(db, 'boards/alice')));
    await assertSucceeds(deleteDoc(doc(db, 'boards/alice')));
  });

  it('nobody else can read, write or delete it', async () => {
    await seed({ 'boards/bob': { data: '{}', client: 'p', updatedAt: 1 } });
    const db = as('alice');
    await assertFails(getDoc(doc(db, 'boards/bob')));
    await assertFails(setDoc(doc(db, 'boards/bob'), board()));
    await assertFails(deleteDoc(doc(db, 'boards/bob')));
  });

  it('needs a verified email and someone signed in', async () => {
    await assertFails(setDoc(doc(asUnverified('alice'), 'boards/alice'), board()));
    await seed({ 'boards/alice': { data: '{}', client: 'p', updatedAt: 1 } });
    await assertFails(getDoc(doc(asUnverified('alice'), 'boards/alice')));
    await assertFails(getDoc(doc(signedOut(), 'boards/alice')));
    await assertFails(setDoc(doc(signedOut(), 'boards/alice'), board()));
  });

  it('takes only the fields the app writes, with the right types', async () => {
    const db = as('alice');
    await assertFails(setDoc(doc(db, 'boards/alice'), { ...board(), foo: 1 }));
    await assertFails(setDoc(doc(db, 'boards/alice'), { ...board(), client: 1 }));
    await assertFails(setDoc(doc(db, 'boards/alice'), { ...board(), data: 5 }));
  });

  it('a later save (an update) is checked the same way', async () => {
    await seed({ 'boards/alice': { data: '{}', client: 'p', updatedAt: 1 } });
    const db = as('alice');
    await assertSucceeds(setDoc(doc(db, 'boards/alice'), board('{"a":1}')));
    await assertFails(setDoc(doc(db, 'boards/alice'), { ...board(), foo: 1 }));
    await assertFails(setDoc(doc(db, 'boards/alice'), board('x'.repeat(ONLINE_LIMIT + 1))));
  });

  // Characters, not bytes: Firestore's own 1 MiB per document can refuse a shorter board of mostly emoji.
  it("caps a saved board at the app's ONLINE_LIMIT characters", async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(doc(db, 'boards/alice'), board('x'.repeat(ONLINE_LIMIT))));
    await assertFails(setDoc(doc(db, 'boards/alice'), board('x'.repeat(ONLINE_LIMIT + 1))));
  });
});

describe('versions (boards/{uid}/versions and versionData)', () => {
  it('its owner can save one as the app does (list entry and board in one batch), read and delete it', async () => {
    const db = as('alice');
    const b = writeBatch(db);
    b.set(doc(db, 'boards/alice/versionData/v1'), { data: '{}' });
    b.set(doc(db, 'boards/alice/versions/v1'), { ...version, boards: 2, hash: 'h', kind: 'outside' });
    await assertSucceeds(b.commit());
    await assertSucceeds(getDocs(collection(db, 'boards/alice/versions')));
    await assertSucceeds(getDoc(doc(db, 'boards/alice/versionData/v1')));
    await assertSucceeds(deleteDoc(doc(db, 'boards/alice/versions/v1')));
    await assertSucceeds(deleteDoc(doc(db, 'boards/alice/versionData/v1')));
  });

  it('a list entry takes only the known fields, a number savedAt and kind "outside"', async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(doc(db, 'boards/alice/versions/v1'), version));
    await assertFails(setDoc(doc(db, 'boards/alice/versions/v2'), { ...version, kind: 'other' }));
    await assertFails(setDoc(doc(db, 'boards/alice/versions/v3'), { ...version, savedAt: '1' }));
    await assertFails(setDoc(doc(db, 'boards/alice/versions/v4'), { ...version, foo: 1 }));
  });

  // Job 173: these had no type or size check, so any amount of anything could be stored in them.
  it('a list entry takes number counts and a short text hash (job 173)', async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(doc(db, 'boards/alice/versions/v1'), { ...version, boards: 3, hash: 'abc-def-1x' }));
    // As older copies of the app saved them: without boards, hash or kind.
    await assertSucceeds(setDoc(doc(db, 'boards/alice/versions/v2'), { savedAt: 1, cards: 4, columns: 2 }));
    await assertFails(setDoc(doc(db, 'boards/alice/versions/v3'), { ...version, cards: 'x'.repeat(5000) }));
    await assertFails(setDoc(doc(db, 'boards/alice/versions/v4'), { ...version, columns: [1, 2] }));
    await assertFails(setDoc(doc(db, 'boards/alice/versions/v5'), { ...version, boards: { a: 1 } }));
    await assertFails(setDoc(doc(db, 'boards/alice/versions/v6'), { ...version, hash: 5 }));
    await assertFails(setDoc(doc(db, 'boards/alice/versions/v7'), { ...version, hash: 'x'.repeat(101) }));
  });

  it("a version's board takes only data, capped like the board", async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(doc(db, 'boards/alice/versionData/v1'), { data: 'x'.repeat(ONLINE_LIMIT) }));
    await assertFails(setDoc(doc(db, 'boards/alice/versionData/v2'), { data: 'x'.repeat(ONLINE_LIMIT + 1) }));
    await assertFails(setDoc(doc(db, 'boards/alice/versionData/v3'), { data: '{}', foo: 1 }));
  });

  it("nobody else can read, write or delete someone's versions", async () => {
    await seed({ 'boards/bob/versions/v1': version, 'boards/bob/versionData/v1': { data: '{}' } });
    const db = as('alice');
    await assertFails(getDocs(collection(db, 'boards/bob/versions')));
    await assertFails(getDoc(doc(db, 'boards/bob/versionData/v1')));
    await assertFails(setDoc(doc(db, 'boards/bob/versions/v2'), version));
    await assertFails(setDoc(doc(db, 'boards/bob/versionData/v2'), { data: '{}' }));
    await assertFails(deleteDoc(doc(db, 'boards/bob/versions/v1')));
    await assertFails(deleteDoc(doc(db, 'boards/bob/versionData/v1')));
    await assertFails(getDoc(doc(asUnverified('bob'), 'boards/bob/versionData/v1')));
  });
});

describe("a person's list of shared boards (boards/{uid}/shared)", () => {
  it('only its owner can add to, read or delete it, and an entry holds only joinedAt', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'boards/alice/shared/s1'), { joinedAt: serverTimestamp() }));
    await assertSucceeds(getDocs(collection(as('alice'), 'boards/alice/shared')));
    await assertFails(setDoc(doc(as('alice'), 'boards/alice/shared/s2'), { joinedAt: 1, foo: 1 }));
    await assertFails(setDoc(doc(as('bob'), 'boards/alice/shared/s3'), { joinedAt: 1 }));
    await assertFails(getDocs(collection(as('bob'), 'boards/alice/shared')));
    await assertFails(deleteDoc(doc(as('bob'), 'boards/alice/shared/s1')));
    await assertSucceeds(deleteDoc(doc(as('alice'), 'boards/alice/shared/s1')));
  });

  it('joinedAt is a time (job 173)', async () => {
    await assertFails(setDoc(doc(as('alice'), 'boards/alice/shared/s2'), { joinedAt: 'x'.repeat(5000) }));
    await assertFails(setDoc(doc(as('alice'), 'boards/alice/shared/s3'), { joinedAt: { a: 1 } }));
  });
});

describe('sharing a board (shared/{sid})', () => {
  it('alice can share a board with herself as its first person, all in one batch', async () => {
    await assertSucceeds(createShare(as('alice')));
  });

  it('refused without her member record, with rev other than 1, for someone else, or with a link that is not text', async () => {
    await assertFails(createShare(as('alice'), share, false));
    await assertFails(createShare(as('alice'), { ...share, rev: 2 }));
    await assertFails(createShare(as('alice'), { ...share, owner: 'bob' }));
    await assertFails(createShare(as('alice'), { ...share, link: 5 }));
    await assertFails(createShare(as('alice'), { ...share, root: 5 }));
    await assertFails(createShare(as('alice'), { ...share, client: 5 }));
    await assertFails(createShare(as('alice'), { ...share, foo: 1 }));
    await assertFails(createShare(as('alice'), { ...share, data: 'x'.repeat(ONLINE_LIMIT + 1) }));
    await assertFails(createShare(asUnverified('alice')));
  });

  it('can be shared with the link turned off', async () => {
    const db = as('alice');
    const b = writeBatch(db);
    b.set(doc(db, 'shared/s1'), { ...share, link: null });
    b.set(doc(db, 'shared/s1/members/alice'), member(null));
    await assertSucceeds(b.commit());
  });
});

describe('reading a shared board', () => {
  it('its people can read it and its list of people; nobody else can', async () => {
    await seedShare(withBob);
    await assertSucceeds(getDoc(doc(as('alice'), 'shared/s1')));
    await assertSucceeds(getDoc(doc(as('bob'), 'shared/s1')));
    await assertSucceeds(getDocs(collection(as('bob'), 'shared/s1/members')));
    await assertFails(getDoc(doc(as('carol'), 'shared/s1')));
    await assertFails(getDocs(collection(as('carol'), 'shared/s1/members')));
    await assertFails(getDoc(doc(as('carol'), 'shared/s1/members/carol')));
    await assertFails(getDoc(doc(signedOut(), 'shared/s1')));
  });

  it('a member whose email is not verified cannot read it', async () => {
    await seedShare(withBob);
    await assertFails(getDoc(doc(asUnverified('bob'), 'shared/s1')));
  });
});

describe('changing a shared board', () => {
  it('a member saves by counting rev up by exactly one (as updateShare does)', async () => {
    await seedShare(withBob);
    const db = as('bob');
    await assertSucceeds(updateDoc(doc(db, 'shared/s1'), { data: '{"a":1}', client: 'q', rev: 2, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'shared/s1'), { data: '{"a":2}', rev: 4 }));
    await assertFails(updateDoc(doc(db, 'shared/s1'), { data: '{"a":3}', rev: 2 }));
    await assertFails(updateDoc(doc(db, 'shared/s1'), { data: '{"a":4}', rev: 1 }));
    // The same rev is fine only when nothing in the board changed.
    await assertSucceeds(updateDoc(doc(db, 'shared/s1'), { client: 'r', rev: 2 }));
  });

  it('the same transaction updateShare runs succeeds for a member', async () => {
    await seedShare(withBob);
    const db = as('bob');
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const snap = await tx.get(doc(db, 'shared/s1'));
        tx.update(doc(db, 'shared/s1'), { data: '{"b":1}', client: 'q', rev: Number(snap.data()!.rev) + 1, updatedAt: serverTimestamp() });
      }),
    );
  });

  it('nobody but its people can change it, and nobody can change its owner or root', async () => {
    await seedShare(withBob);
    await assertFails(updateDoc(doc(as('carol'), 'shared/s1'), { data: '{"c":1}', rev: 2 }));
    await assertFails(updateDoc(doc(as('bob'), 'shared/s1'), { owner: 'bob', rev: 2 }));
    await assertFails(updateDoc(doc(as('alice'), 'shared/s1'), { owner: 'bob', rev: 2 }));
    await assertFails(updateDoc(doc(as('alice'), 'shared/s1'), { root: 'b2', rev: 2 }));
    await assertFails(updateDoc(doc(as('bob'), 'shared/s1'), { foo: 1, rev: 2 }));
    await assertFails(updateDoc(doc(as('bob'), 'shared/s1'), { data: 'x'.repeat(ONLINE_LIMIT + 1), rev: 2 }));
  });

  it('only the person who shared it can change or turn off the link', async () => {
    await seedShare(withBob);
    await assertFails(updateDoc(doc(as('bob'), 'shared/s1'), { link: 'k2' }));
    await assertFails(updateDoc(doc(as('bob'), 'shared/s1'), { link: null }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'shared/s1'), { link: 'k2' }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'shared/s1'), { link: null }));
  });
});

describe('joining a shared board (shared/{sid}/members/{uid})', () => {
  it('works with the current link key, as join does', async () => {
    await seedShare();
    await assertSucceeds(join(as('bob'), 'bob', 'k'));
    await assertSucceeds(getDoc(doc(as('bob'), 'shared/s1')));
  });

  it('is refused with a wrong key, an old key after the link changed, or when the link is off', async () => {
    await seedShare();
    await assertFails(join(as('bob'), 'bob', 'wrong'));
    await seed({ 'shared/s1': { ...share, link: 'k2' } });
    await assertFails(join(as('bob'), 'bob', 'k'));
    await seed({ 'shared/s1': { ...share, link: null } });
    await assertFails(join(as('bob'), 'bob', 'k'));
    await assertFails(setDoc(doc(as('bob'), 'shared/s1/members/bob'), { ...member(null) }));
  });

  it("someone who isn't on it can't set the link to their own key to let themselves in", async () => {
    await seedShare();
    const db = as('carol');
    const b = writeBatch(db);
    b.update(doc(db, 'shared/s1'), { link: 'mine' });
    b.set(doc(db, 'shared/s1/members/carol'), member('mine'));
    await assertFails(b.commit());
  });

  it('is refused for a share that does not exist', async () => {
    await assertFails(join(as('bob'), 'bob', 'k'));
  });

  it('is refused for someone else, an unverified email, or someone signed out', async () => {
    await seedShare();
    await assertFails(setDoc(doc(as('bob'), 'shared/s1/members/carol'), member('k')));
    await assertFails(join(asUnverified('bob'), 'bob', 'k'));
    await assertFails(setDoc(doc(signedOut(), 'shared/s1/members/bob'), member('k')));
  });

  it('checks the member record: known fields, a name of at most 200 characters, a photo that is https', async () => {
    await seedShare();
    await assertFails(join(as('bob'), 'bob', 'k', { foo: 1 }));
    await assertFails(join(as('bob'), 'bob', 'k', { name: 'x'.repeat(201) }));
    await assertFails(join(as('bob'), 'bob', 'k', { photo: 'http://x' }));
    await assertFails(join(as('bob'), 'bob', 'k', { photo: 'https://' + 'x'.repeat(2000) }));
    await assertSucceeds(join(as('bob'), 'bob', 'k', { name: 'x'.repeat(200), photo: 'https://lh3.example/p.png' }));
  });

  it('joinedAt on the member record is a time (job 173)', async () => {
    await seedShare();
    await assertFails(join(as('bob'), 'bob', 'k', { joinedAt: 'x'.repeat(5000) }));
    await assertFails(join(as('bob'), 'bob', 'k', { joinedAt: 12 }));
  });

  it('a member can update their own record while it holds the current key', async () => {
    await seedShare(withBob);
    await assertSucceeds(setDoc(doc(as('bob'), 'shared/s1/members/bob'), { ...member('k'), name: 'Bobby' }));
    await assertFails(setDoc(doc(as('bob'), 'shared/s1/members/bob'), { ...member('old'), name: 'Bobby' }));
  });

  it('the person who shared it can rejoin without the key, even with the link off', async () => {
    await seedShare();
    await seed({ 'shared/s1': { ...share, link: null } });
    await assertSucceeds(setDoc(doc(as('alice'), 'shared/s1/members/alice'), member('anything')));
  });
});

describe('leaving and removing people', () => {
  it('a member can leave (their record and list entry in one batch), but not remove someone else', async () => {
    await seedShare({ ...withBob, 'shared/s1/members/carol': { name: 'C', photo: null, key: 'k', joinedAt: 1 } });
    await assertFails(deleteDoc(doc(as('bob'), 'shared/s1/members/carol')));
    const db = as('bob');
    const b = writeBatch(db);
    b.delete(doc(db, 'shared/s1/members/bob'));
    b.delete(doc(db, 'boards/bob/shared/s1'));
    await assertSucceeds(b.commit());
    await assertFails(getDoc(doc(as('bob'), 'shared/s1')));
  });

  it('a member can still leave after the shared board itself was deleted', async () => {
    await seed({ 'shared/s1/members/bob': { name: 'B', photo: null, key: 'k', joinedAt: 1 } });
    await assertSucceeds(deleteDoc(doc(as('bob'), 'shared/s1/members/bob')));
  });

  it('removing someone and changing the link in one transaction (removePerson) shuts them out', async () => {
    await seedShare(withBob);
    const db = as('alice');
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        await tx.get(doc(db, 'shared/s1'));
        tx.delete(doc(db, 'shared/s1/members/bob'));
        tx.update(doc(db, 'shared/s1'), { link: 'k2' });
      }),
    );
    await assertFails(getDoc(doc(as('bob'), 'shared/s1')));
    await assertFails(join(as('bob'), 'bob', 'k'));
    await assertSucceeds(join(as('bob'), 'bob', 'k2'));
  });
});

describe('deleting a shared board', () => {
  it('the person who shared it deletes it with all its member records in one batch (deleteShare)', async () => {
    await seedShare(withBob);
    const db = as('alice');
    const members = await getDocs(collection(db, 'shared/s1/members'));
    const b = writeBatch(db);
    members.docs.forEach((m) => b.delete(m.ref));
    b.delete(doc(db, 'shared/s1'));
    await assertSucceeds(b.commit());
  });

  it('nobody else can delete it', async () => {
    await seedShare(withBob);
    await assertFails(deleteDoc(doc(as('bob'), 'shared/s1')));
    await assertFails(deleteDoc(doc(as('carol'), 'shared/s1')));
  });
});

describe('deleting an account (deleteOwnData)', () => {
  it("alice deletes her board, versions and list of shared boards in one batch, but can't do it to bob's", async () => {
    await seed({
      'boards/alice': { data: '{}', client: 'p', updatedAt: 1 },
      'boards/alice/versions/v1': version,
      'boards/alice/versionData/v1': { data: '{}' },
      'boards/alice/shared/s1': { joinedAt: 1 },
      'boards/bob': { data: '{}', client: 'p', updatedAt: 1 },
    });
    const db = as('alice');
    const b = writeBatch(db);
    for (const p of ['boards/alice/versions/v1', 'boards/alice/versionData/v1', 'boards/alice/shared/s1', 'boards/alice']) b.delete(doc(db, p));
    await assertSucceeds(b.commit());
    await assertFails(deleteDoc(doc(db, 'boards/bob')));
  });
});

// Review 137-A H5: a page deleting the account first replaces the board with a marker, so the
// person's other pages can't save their boards or versions again while it deletes the rest.
describe('deleting an account: the marker on boards/{uid}', () => {
  const marker = (deleting: 'started' | 'done', client = 'p') => ({ deleting, client, updatedAt: serverTimestamp() });
  const saved = { data: '{"a":1}', client: 'q', updatedAt: 1 };
  const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);
  const startedBy = (client: string, minutes = 1) => ({ data: '{"a":1}', deleting: 'started', client, updatedAt: minutesAgo(minutes) });
  const saveVersion = (db: Firestore) => {
    const b = writeBatch(db);
    b.set(doc(db, 'boards/alice/versionData/v2'), { data: '{}' });
    b.set(doc(db, 'boards/alice/versions/v2'), version);
    return b.commit();
  };

  it('alice marks her board as markDeleting does (the boards stay in it), and only with the known fields', async () => {
    await seed({ 'boards/alice': saved });
    const db = as('alice');
    const mark = (over: object) => setDoc(doc(db, 'boards/alice'), { ...marker('started'), ...over }, { merge: true });
    await assertFails(mark({ deleting: 'soon' }));
    await assertFails(mark({ updatedAt: 1 }));
    await assertFails(mark({ foo: 1 }));
    await assertFails(setDoc(doc(as('bob'), 'boards/alice'), marker('started'), { merge: true }));
    await assertSucceeds(mark({}));
    // With no board online yet, too.
    await assertSucceeds(setDoc(doc(as('carol'), 'boards/carol'), marker('started'), { merge: true }));
  });

  it('while deleting, another page of hers can save neither her boards, nor a version, nor a new shared board', async () => {
    await seed({ 'boards/alice': startedBy('p'), 'boards/alice/versions/v1': version, 'boards/alice/shared/s1': { joinedAt: 1 } });
    const db = as('alice');
    await assertFails(setDoc(doc(db, 'boards/alice'), { ...board(), client: 'q' }));
    await assertFails(setDoc(doc(db, 'boards/alice'), { ...marker('started'), client: 'q' }));
    await assertFails(saveVersion(db));
    await assertFails(setDoc(doc(db, 'boards/alice/versionData/v3'), { data: '{}' }));
    await assertFails(createShare(db));
    // Deleting still works.
    await assertSucceeds(deleteDoc(doc(db, 'boards/alice/versions/v1')));
    await assertSucceeds(deleteDoc(doc(db, 'boards/alice/shared/s1')));
  });

  it('the page deleting can put her boards back if deleting fails, or finish it (a "done" holds no boards)', async () => {
    await seed({ 'boards/alice': startedBy('p') });
    await assertSucceeds(setDoc(doc(as('alice'), 'boards/alice'), board()));
    await assertSucceeds(setDoc(doc(as('alice'), 'boards/alice'), marker('started'), { merge: true }));
    await assertFails(setDoc(doc(as('alice'), 'boards/alice'), marker('done'), { merge: true }));
    await assertSucceeds(setDoc(doc(as('alice'), 'boards/alice'), marker('done')));
  });

  it('a marker left over 10 minutes (the deleting page closed part-way) no longer holds her other pages back', async () => {
    await seed({ 'boards/alice': startedBy('p', 11) });
    await assertSucceeds(setDoc(doc(as('alice'), 'boards/alice'), { ...board(), client: 'q' }));
  });

  it('once done, no page can save her boards or a version there again, however late', async () => {
    await seed({ 'boards/alice': { deleting: 'done', client: 'p', updatedAt: minutesAgo(60 * 24) } });
    const db = as('alice');
    await assertFails(setDoc(doc(db, 'boards/alice'), board()));
    await assertFails(setDoc(doc(db, 'boards/alice'), { ...board(), client: 'q' }));
    await assertFails(saveVersion(db));
    await assertFails(createShare(db));
  });

  it('once done, any page of hers can go through deleting again (only the sign-in failed to go, and the page was reloaded)', async () => {
    await seed({ 'boards/alice': { deleting: 'done', client: 'p', updatedAt: minutesAgo(1) } });
    const db = as('alice');
    await assertSucceeds(setDoc(doc(db, 'boards/alice'), marker('started', 'q'), { merge: true }));
    await assertSucceeds(setDoc(doc(db, 'boards/alice'), marker('done', 'q')));
  });

  it('saves as before when there is no marker', async () => {
    await seed({ 'boards/alice': saved });
    await assertSucceeds(setDoc(doc(as('alice'), 'boards/alice'), board()));
    await assertSucceeds(saveVersion(as('alice')));
    await assertSucceeds(createShare(as('alice')));
  });
});

describe('feedback', () => {
  const note = (over: object = {}) => ({ text: 'hi', uid: 'alice', email: emailOf('alice'), sentAt: serverTimestamp(), ...over });

  it('a signed-in person can send a note as themselves, as sendFeedback does', async () => {
    await assertSucceeds(addDoc(collection(as('alice'), 'feedback'), note()));
  });

  it('is refused as someone else, with another email, an empty or too long note, a made-up time, or extra fields', async () => {
    const db = as('alice');
    await assertFails(addDoc(collection(db, 'feedback'), note({ uid: 'bob' })));
    await assertFails(addDoc(collection(db, 'feedback'), note({ email: 'other@example.com' })));
    await assertFails(addDoc(collection(db, 'feedback'), note({ text: '' })));
    await assertFails(addDoc(collection(db, 'feedback'), note({ text: 'x'.repeat(1001) })));
    await assertFails(addDoc(collection(db, 'feedback'), note({ sentAt: Date.now() })));
    await assertFails(addDoc(collection(db, 'feedback'), note({ foo: 1 })));
    await assertFails(addDoc(collection(asUnverified('alice'), 'feedback'), note()));
    await assertFails(addDoc(collection(signedOut(), 'feedback'), note()));
  });

  it('nobody can read, change or delete feedback from the app', async () => {
    await seed({ 'feedback/f1': { text: 'hi', uid: 'alice', email: emailOf('alice'), sentAt: 1 } });
    const db = as('alice');
    await assertFails(getDoc(doc(db, 'feedback/f1')));
    await assertFails(getDocs(collection(db, 'feedback')));
    await assertFails(updateDoc(doc(db, 'feedback/f1'), { text: 'changed' }));
    await assertFails(deleteDoc(doc(db, 'feedback/f1')));
  });
});

describe('everything else', () => {
  it('is closed: no other collection or sub-collection can be read or written', async () => {
    const db = as('alice');
    await assertFails(setDoc(doc(db, 'other/x'), { a: 1 }));
    await assertFails(getDoc(doc(db, 'other/x')));
    await assertFails(setDoc(doc(db, 'boards/alice/other/x'), { a: 1 }));
    await assertFails(setDoc(doc(db, 'shared/s1/other/x'), { a: 1 }));
  });
});
