// Roles on shared boards (job 161, PR 1): links kept in an editors-only record, joining through a
// record nobody can read, saving only for editors, roles nobody can raise for themselves, and
// comments. Every write uses the shapes src/sync/database.ts writes (or will write, for roles and
// comments). The shapes today's live app writes are in firestore-rules.test.ts and the "older app"
// tests below. Run with `npm run test:rules`.
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch, type Firestore } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { as, seed, signedOut, useRulesEnv } from './env';

useRulesEnv();

const LINKS = 'shared/s1/private/links';
const EDIT = 'edit-key-0123456789';
const COMMENT = 'comment-key-0123456';
const VIEW = 'view-key-0123456789';
/** A share as the new app makes it: no key in the share itself. */
const share = { owner: 'alice', root: 'b1', link: null, data: '{}', client: 'p', rev: 1, updatedAt: 1 };
const person = (role?: string) => ({ name: 'A', photo: null, joinedAt: 1, ...(role ? { role } : {}) });
const record = (role?: string) => ({ name: 'B', photo: null, joinedAt: serverTimestamp(), ...(role ? { role } : {}) });

/** alice's share s1 with its links, and the people given as uid → role ('' for a member from before roles). */
function seedShare(people: Record<string, string> = {}, links: object = { edit: EDIT }, over: object = {}) {
  const docs: Record<string, object> = { 'shared/s1': { ...share, ...over }, [LINKS]: links, 'shared/s1/members/alice': person() };
  for (const [uid, role] of Object.entries(people)) docs[`shared/s1/members/${uid}`] = person(role || undefined);
  return seed(docs);
}

/** alice shares a board, as createShare does now: the share, its links, her record and list entry, together. */
function createShare(db: Firestore, links: object = { edit: EDIT }, s: object = share) {
  const b = writeBatch(db);
  b.set(doc(db, 'shared/s1'), { ...s, updatedAt: serverTimestamp() });
  b.set(doc(db, LINKS), links);
  b.set(doc(db, 'shared/s1/members/alice'), { name: 'A', photo: null, role: 'edit', joinedAt: serverTimestamp() });
  b.set(doc(db, 'boards/alice/shared/s1'), { joinedAt: serverTimestamp() });
  return b.commit();
}

/** Someone joins as join does now: the key in joins/{uid}, their record with a role, their list entry. */
function join(db: Firestore, uid: string, key: string, role = 'edit', extra: object = {}) {
  const b = writeBatch(db);
  b.set(doc(db, `shared/s1/joins/${uid}`), { key });
  b.set(doc(db, `shared/s1/members/${uid}`), { ...record(role), ...extra });
  b.set(doc(db, `boards/${uid}/shared/s1`), { joinedAt: serverTimestamp() });
  return b.commit();
}

/** Joins as the app before this change does: the key in the member record, no role. */
function oldJoin(db: Firestore, uid: string, key: string) {
  const b = writeBatch(db);
  b.set(doc(db, `shared/s1/members/${uid}`), { name: 'B', photo: null, key, joinedAt: serverTimestamp() });
  b.set(doc(db, `boards/${uid}/shared/s1`), { joinedAt: serverTimestamp() });
  return b.commit();
}

const save = (db: Firestore, rev = 2) => updateDoc(doc(db, 'shared/s1'), { data: `{"r":${rev}}`, client: 'q', rev, updatedAt: serverTimestamp() });

describe('sharing with the links in a private record', () => {
  it('alice shares a board as createShare does now', async () => {
    await assertSucceeds(createShare(as('alice')));
  });

  it('nobody but the person sharing it can make its links', async () => {
    await seedShare({ bob: '' });
    await assertFails(setDoc(doc(as('bob'), LINKS), { edit: 'bobs-own-key-012345' }));
    await assertFails(setDoc(doc(as('carol'), LINKS), { edit: 'carols-own-key-0123' }));
    await assertSucceeds(setDoc(doc(as('alice'), LINKS), { edit: 'a-new-key-012345678' }));
  });

  it('the links record holds only edit, comment and view keys: each text of 16 to 100 characters or null, all different', async () => {
    await assertFails(createShare(as('alice'), { edit: EDIT, foo: 1 }));
    await assertFails(createShare(as('alice'), { edit: 5 }));
    await assertFails(createShare(as('alice'), { edit: 'short' }));
    await assertFails(createShare(as('alice'), { edit: 'x'.repeat(101) }));
    await assertFails(createShare(as('alice'), { edit: EDIT, view: EDIT }));
    await assertFails(createShare(as('alice'), { edit: EDIT, comment: VIEW, view: VIEW }));
    await assertSucceeds(createShare(as('alice'), { edit: null }));
  });

  it('only editors can read the links; viewers, commenters and outsiders cannot', async () => {
    await seedShare({ bob: '', carol: 'edit', dan: 'comment', erin: 'view' }, { edit: EDIT, comment: COMMENT, view: VIEW });
    await assertSucceeds(getDoc(doc(as('alice'), LINKS)));
    await assertSucceeds(getDoc(doc(as('bob'), LINKS)));
    await assertSucceeds(getDoc(doc(as('carol'), LINKS)));
    await assertFails(getDoc(doc(as('dan'), LINKS)));
    await assertFails(getDoc(doc(as('erin'), LINKS)));
    await assertFails(getDoc(doc(as('frank'), LINKS)));
    await assertFails(getDoc(doc(signedOut(), LINKS)));
  });

  it('setLink moves the link: a new key in the private record and none in the share, in one batch', async () => {
    await seed({ 'shared/s1': { ...share, link: 'k' }, 'shared/s1/members/alice': person() });
    const db = as('alice');
    const b = writeBatch(db);
    b.set(doc(db, LINKS), { edit: 'a-new-key-012345678' }, { merge: true });
    b.update(doc(db, 'shared/s1'), { link: null });
    await assertSucceeds(b.commit());
  });

  it('the links record can only go with the share itself', async () => {
    await seedShare();
    await assertFails(deleteDoc(doc(as('alice'), LINKS)));
    await assertFails(setDoc(doc(as('alice'), 'shared/s1/private/other'), { edit: EDIT }));
  });
});

describe('joining through joins/{uid}', () => {
  it('works with the edit key, as join does now, and the person can then read the board', async () => {
    await seedShare();
    await assertSucceeds(join(as('bob'), 'bob', EDIT));
    await assertSucceeds(getDoc(doc(as('bob'), 'shared/s1')));
  });

  it('works on a share from before (its key still in the share itself)', async () => {
    await seed({ 'shared/s1': { ...share, link: 'k' }, 'shared/s1/members/alice': person() });
    await assertSucceeds(join(as('bob'), 'bob', 'k'));
  });

  it('gives exactly the role that matches the key', async () => {
    await seedShare({}, { edit: EDIT, comment: COMMENT, view: VIEW });
    await assertFails(join(as('bob'), 'bob', VIEW, 'edit'));
    await assertFails(join(as('bob'), 'bob', VIEW, 'comment'));
    await assertFails(join(as('bob'), 'bob', COMMENT, 'edit'));
    await assertFails(join(as('bob'), 'bob', VIEW));
    await assertSucceeds(join(as('bob'), 'bob', VIEW, 'view'));
    await assertSucceeds(join(as('carol'), 'carol', COMMENT, 'comment'));
    await assertSucceeds(join(as('dan'), 'dan', EDIT, 'edit'));
  });

  it('a member record with no role is an editor, so it needs the edit key', async () => {
    await seedShare({}, { edit: EDIT, comment: COMMENT, view: VIEW });
    const db = as('bob');
    const b = writeBatch(db);
    b.set(doc(db, 'shared/s1/joins/bob'), { key: VIEW });
    b.set(doc(db, 'shared/s1/members/bob'), { name: 'B', photo: null, joinedAt: serverTimestamp() });
    await assertFails(b.commit());
  });

  it('is refused with a wrong key, a link that is off, or a role that is not one of the three', async () => {
    await seedShare({}, { edit: null, comment: COMMENT, view: null });
    await assertFails(join(as('bob'), 'bob', 'wrong-key-0123456789'));
    await assertFails(join(as('bob'), 'bob', EDIT));
    await assertFails(join(as('bob'), 'bob', COMMENT, 'owner'));
    await assertSucceeds(join(as('bob'), 'bob', COMMENT, 'comment'));
  });

  it('nobody can read a joins record, not even its writer or the person who shared it', async () => {
    await seedShare({ bob: 'view' });
    await seed({ 'shared/s1/joins/bob': { key: VIEW } });
    await assertFails(getDoc(doc(as('bob'), 'shared/s1/joins/bob')));
    await assertFails(getDoc(doc(as('alice'), 'shared/s1/joins/bob')));
    await assertFails(getDocs(collection(as('alice'), 'shared/s1/joins')));
  });

  it('a joins record is only for oneself, holds only a key, and its key is short text', async () => {
    await seedShare({ bob: 'edit' });
    await assertFails(setDoc(doc(as('bob'), 'shared/s1/joins/carol'), { key: EDIT }));
    await assertFails(setDoc(doc(as('bob'), 'shared/s1/joins/bob'), { key: EDIT, foo: 1 }));
    await assertFails(setDoc(doc(as('bob'), 'shared/s1/joins/bob'), { key: 5 }));
    await assertFails(setDoc(doc(as('bob'), 'shared/s1/joins/bob'), { key: 'x'.repeat(101) }));
    await assertSucceeds(setDoc(doc(as('bob'), 'shared/s1/joins/bob'), { key: EDIT }));
  });

  // Code review (high): otherwise anyone could fill the storage with joins records under made-up ids.
  it('a joins record is only written with a member record (joining), never on its own', async () => {
    await seedShare();
    await assertFails(setDoc(doc(as('carol'), 'shared/s1/joins/carol'), { key: 'wrong-key-0123456789' }));
    await assertFails(setDoc(doc(as('carol'), 'shared/nothing/joins/carol'), { key: 'x' }));
  });

  it('a joins record left from an old key lets nobody back in once the key changed', async () => {
    await seedShare();
    await seed({ 'shared/s1/joins/bob': { key: 'old-key-0123456789' } });
    await assertFails(setDoc(doc(as('bob'), 'shared/s1/members/bob'), record('edit')));
  });

  it('leaving takes the joins record too (one batch); the person who shared it can delete anyone’s', async () => {
    await seedShare({ bob: 'edit', carol: 'edit' });
    await seed({ 'shared/s1/joins/bob': { key: EDIT }, 'shared/s1/joins/carol': { key: EDIT } });
    await assertFails(deleteDoc(doc(as('bob'), 'shared/s1/joins/carol')));
    const db = as('bob');
    const b = writeBatch(db);
    b.delete(doc(db, 'shared/s1/members/bob'));
    b.delete(doc(db, 'shared/s1/joins/bob'));
    b.delete(doc(db, 'boards/bob/shared/s1'));
    await assertSucceeds(b.commit());
    await assertSucceeds(deleteDoc(doc(as('alice'), 'shared/s1/joins/carol')));
  });
});

describe('roles: nobody raises their own', () => {
  it('a member can change their own name and photo while the role stays the same', async () => {
    await seedShare({ bob: 'view', carol: '' });
    await assertSucceeds(setDoc(doc(as('bob'), 'shared/s1/members/bob'), { ...record('view'), name: 'Bobby' }));
    await assertSucceeds(setDoc(doc(as('carol'), 'shared/s1/members/carol'), { ...record(), name: 'Caz' }));
    await assertSucceeds(setDoc(doc(as('carol'), 'shared/s1/members/carol'), { ...record('edit'), name: 'Caz' }));
  });

  it('a viewer or commenter cannot make themselves an editor or commenter, by any shape of record', async () => {
    await seedShare({ bob: 'view', carol: 'comment' }, { edit: EDIT, comment: COMMENT, view: VIEW });
    await assertFails(setDoc(doc(as('bob'), 'shared/s1/members/bob'), record('edit')));
    await assertFails(setDoc(doc(as('bob'), 'shared/s1/members/bob'), record('comment')));
    await assertFails(setDoc(doc(as('bob'), 'shared/s1/members/bob'), record()));
    await assertFails(updateDoc(doc(as('bob'), 'shared/s1/members/bob'), { role: 'edit' }));
    await assertFails(setDoc(doc(as('carol'), 'shared/s1/members/carol'), record('edit')));
    // With a key they hold (their own), still only their own role.
    await assertFails(join(as('bob'), 'bob', VIEW, 'edit'));
    await assertFails(join(as('carol'), 'carol', COMMENT, 'edit'));
  });

  it('…not even with an old key that today’s member records still hold', async () => {
    await seedShare({ bob: 'view' }, { edit: EDIT, comment: null, view: VIEW });
    await seed({ 'shared/s1/members/dan': { name: 'D', photo: null, key: 'old-key-0123456789', joinedAt: 1 } });
    await assertFails(setDoc(doc(as('bob'), 'shared/s1/members/bob'), { ...record(), key: 'old-key-0123456789' }));
    await assertFails(join(as('bob'), 'bob', 'old-key-0123456789', 'edit'));
  });

  it('a member with a higher key can take that role (an editor’s link opened by a viewer)', async () => {
    await seedShare({ bob: 'view' }, { edit: EDIT, comment: COMMENT, view: VIEW });
    await assertSucceeds(join(as('bob'), 'bob', EDIT, 'edit'));
  });

  it('only the person who shared it changes someone else’s role, and only the role', async () => {
    await seedShare({ bob: 'view', carol: 'edit', dan: 'view' }, { edit: EDIT, comment: COMMENT, view: VIEW });
    await assertFails(updateDoc(doc(as('carol'), 'shared/s1/members/bob'), { role: 'edit' }));
    await assertFails(updateDoc(doc(as('alice'), 'shared/s1/members/bob'), { role: 'boss' }));
    await assertFails(updateDoc(doc(as('alice'), 'shared/s1/members/bob'), { role: 'edit', name: 'X' }));
    await assertFails(setDoc(doc(as('alice'), 'shared/s1/members/frank'), record('view')));
    await assertSucceeds(updateDoc(doc(as('alice'), 'shared/s1/members/bob'), { role: 'edit' }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'shared/s1/members/dan'), { role: 'comment' }));
  });

  // Code review (high): an editor has read every key, so lowering them must change the keys above their new role.
  it('lowering someone changes the keys of every role above their new one, in the same step', async () => {
    await seedShare({ bob: 'edit', carol: 'comment' }, { edit: EDIT, comment: COMMENT, view: VIEW });
    const lower = (uid: string, role: string, links: object) => {
      const db = as('alice');
      const b = writeBatch(db);
      b.update(doc(db, `shared/s1/members/${uid}`), { role });
      b.set(doc(db, LINKS), links, { merge: true });
      return b.commit();
    };
    await assertFails(updateDoc(doc(as('alice'), 'shared/s1/members/bob'), { role: 'view' }));
    await assertFails(lower('bob', 'view', { edit: 'new-edit-0123456789' }));
    await assertFails(lower('carol', 'view', { edit: 'new-edit-0123456789' }));
    await assertSucceeds(lower('bob', 'comment', { edit: 'new-edit-0123456789' }));
    await assertFails(join(as('bob'), 'bob', EDIT, 'edit'));
    await assertSucceeds(lower('carol', 'view', { edit: 'newer-edit-012345678', comment: 'new-comment-0123456' }));
    // Raising someone needs no new keys.
    await assertSucceeds(updateDoc(doc(as('alice'), 'shared/s1/members/carol'), { role: 'edit' }));
  });

  it('the person who shared it is always an editor', async () => {
    await seedShare();
    await assertFails(setDoc(doc(as('alice'), 'shared/s1/members/alice'), record('view')));
    await assertSucceeds(setDoc(doc(as('alice'), 'shared/s1/members/alice'), record('edit')));
  });
});

describe('saving a shared board needs role edit', () => {
  it('an editor (or a member from before roles) saves; a commenter or viewer cannot', async () => {
    await seedShare({ bob: '', carol: 'edit', dan: 'comment', erin: 'view' });
    await assertSucceeds(save(as('bob'), 2));
    await assertSucceeds(save(as('carol'), 3));
    await assertFails(save(as('dan'), 4));
    await assertFails(save(as('erin'), 4));
  });

  it('a viewer can still read the board and its people', async () => {
    await seedShare({ erin: 'view' });
    await assertSucceeds(getDoc(doc(as('erin'), 'shared/s1')));
    await assertSucceeds(getDocs(collection(as('erin'), 'shared/s1/members')));
  });
});

describe('the first comment or view link changes the edit link (D1)', () => {
  it('making a view link while keeping the same edit key is refused', async () => {
    await seedShare();
    await assertFails(setDoc(doc(as('alice'), LINKS), { edit: EDIT, view: VIEW }));
    await assertFails(setDoc(doc(as('alice'), LINKS), { edit: EDIT, comment: COMMENT }));
  });

  it('…and so is reusing the key that is still in a share from before', async () => {
    await seed({ 'shared/s1': { ...share, link: 'k-0123456789abcdef' }, 'shared/s1/members/alice': person() });
    const db = as('alice');
    const b = writeBatch(db);
    b.set(doc(db, LINKS), { edit: 'k-0123456789abcdef', view: VIEW });
    b.update(doc(db, 'shared/s1'), { link: null });
    await assertFails(b.commit());
  });

  it('with a new edit key it works, and the key must leave the share itself in the same batch', async () => {
    await seed({ 'shared/s1': { ...share, link: 'k-0123456789abcdef' }, 'shared/s1/members/alice': person() });
    await assertFails(setDoc(doc(as('alice'), LINKS), { edit: 'new-edit-0123456789', view: VIEW }));
    const db = as('alice');
    const b = writeBatch(db);
    b.set(doc(db, LINKS), { edit: 'new-edit-0123456789', view: VIEW });
    b.update(doc(db, 'shared/s1'), { link: null });
    await assertSucceeds(b.commit());
  });

  it('once roles are in use, the keys stay in the record (off is null) and the share holds no key', async () => {
    await seedShare({}, { edit: EDIT, comment: null, view: VIEW });
    await assertFails(setDoc(doc(as('alice'), LINKS), { edit: 'another-edit-012345' }));
    await assertSucceeds(setDoc(doc(as('alice'), LINKS), { edit: null, comment: null, view: null }));
    await assertFails(updateDoc(doc(as('alice'), 'shared/s1'), { link: 'k-0123456789abcdef' }));
    // After that, the app before this change can't join with a key in its record, even the edit key.
    await assertFails(oldJoin(as('bob'), 'bob', EDIT));
  });

  // Security check: everyone on the board can read every member record.
  it('once roles are in use, no member record can take a new key (not even the owner’s, from an old app)', async () => {
    await seedShare({ bob: 'edit' }, { edit: EDIT, comment: null, view: VIEW });
    await assertFails(setDoc(doc(as('alice'), 'shared/s1/members/alice'), { ...record(), key: EDIT }));
    await assertFails(setDoc(doc(as('bob'), 'shared/s1/members/bob'), { ...record('edit'), key: EDIT }));
    await assertSucceeds(setDoc(doc(as('alice'), 'shared/s1/members/alice'), record('edit')));
  });

  it('a brand new share can have all three links from the start', async () => {
    await assertSucceeds(createShare(as('alice'), { edit: EDIT, comment: COMMENT, view: VIEW }));
  });
});

describe('removing someone changes every link that is on', () => {
  const remove = (db: Firestore, links: object) =>
    runTransaction(db, async (tx) => {
      await tx.get(doc(db, LINKS));
      tx.delete(doc(db, 'shared/s1/members/bob'));
      tx.delete(doc(db, 'shared/s1/joins/bob'));
      tx.set(doc(db, LINKS), links, { merge: true });
    });

  it('as removePerson does now: refused if a link that is on keeps its key', async () => {
    await seedShare({ bob: 'view' }, { edit: EDIT, comment: null, view: VIEW });
    await assertFails(remove(as('alice'), { edit: 'new-edit-0123456789' }));
    await assertFails(deleteDoc(doc(as('alice'), 'shared/s1/members/bob')));
    await assertSucceeds(remove(as('alice'), { edit: 'new-edit-0123456789', view: 'new-view-0123456789' }));
    await assertFails(join(as('bob'), 'bob', VIEW, 'view'));
  });

  it('as removePerson does on a share from before: the key moves out of the share as it changes', async () => {
    await seed({ 'shared/s1': { ...share, link: 'k' }, 'shared/s1/members/alice': person(), 'shared/s1/members/bob': { name: 'B', photo: null, key: 'k', joinedAt: 1 } });
    const db = as('alice');
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        await tx.get(doc(db, 'shared/s1'));
        await tx.get(doc(db, LINKS));
        tx.delete(doc(db, 'shared/s1/members/bob'));
        tx.delete(doc(db, 'shared/s1/joins/bob'));
        tx.set(doc(db, LINKS), { edit: 'new-edit-0123456789' }, { merge: true });
        tx.update(doc(db, 'shared/s1'), { link: null });
      }),
    );
    await assertFails(oldJoin(as('bob'), 'bob', 'k'));
    await assertFails(join(as('bob'), 'bob', 'k'));
  });

  // Code review (high): the key of a share from before is in the share itself.
  it('on a share from before, removing someone needs the key in the share to change too', async () => {
    await seed({ 'shared/s1': { ...share, link: 'k' }, 'shared/s1/members/alice': person(), 'shared/s1/members/bob': { name: 'B', photo: null, key: 'k', joinedAt: 1 } });
    await assertFails(deleteDoc(doc(as('alice'), 'shared/s1/members/bob')));
  });

  it('with every link off, nothing has to change', async () => {
    await seedShare({ bob: 'edit' }, { edit: null });
    await assertSucceeds(deleteDoc(doc(as('alice'), 'shared/s1/members/bob')));
  });
});

describe('deleting a shared board takes its links, joins and comments', () => {
  it('as deleteShare does now: comments and joins records first, then the rest in one batch', async () => {
    await seedShare({ bob: 'edit', carol: 'comment' });
    await seed({ 'shared/s1/joins/bob': { key: EDIT }, 'shared/s1/comments/c1': { card: 'c_1', text: 'hi', author: 'carol', name: 'C', photo: null, at: 1, resolved: false } });
    const db = as('alice');
    const members = await getDocs(collection(db, 'shared/s1/members'));
    const comments = await getDocs(collection(db, 'shared/s1/comments'));
    const first = writeBatch(db);
    comments.docs.forEach((c) => first.delete(c.ref));
    members.docs.forEach((m) => first.delete(doc(db, `shared/s1/joins/${m.id}`)));
    await assertSucceeds(first.commit());
    const b = writeBatch(db);
    members.docs.forEach((m) => b.delete(m.ref));
    b.delete(doc(db, LINKS));
    b.delete(doc(db, 'shared/s1'));
    await assertSucceeds(b.commit());
  });

  it('nobody else can delete its links', async () => {
    await seedShare({ bob: 'edit' });
    const db = as('bob');
    const b = writeBatch(db);
    b.delete(doc(db, LINKS));
    await assertFails(b.commit());
  });
});

describe('the app before this change (today’s live app and older cached copies)', () => {
  it('joins a share the new app made, by the edit key in its record, while there are no comment or view links', async () => {
    await seedShare();
    await assertSucceeds(oldJoin(as('bob'), 'bob', EDIT));
    await assertFails(oldJoin(as('carol'), 'carol', 'wrong-key-0123456789'));
  });

  it('the person who shared it can still turn the link off and on (in the share), and delete it, while no comment or view link was made', async () => {
    await seedShare({ bob: '' });
    await assertSucceeds(updateDoc(doc(as('alice'), 'shared/s1'), { link: null }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'shared/s1'), { link: 'k2' }));
    await assertSucceeds(oldJoin(as('carol'), 'carol', 'k2'));
    const db = as('alice');
    const members = await getDocs(collection(db, 'shared/s1/members'));
    const b = writeBatch(db);
    members.docs.forEach((m) => b.delete(m.ref));
    b.delete(doc(db, 'shared/s1'));
    await assertSucceeds(b.commit());
  });

  it('an editor on the old app keeps saving a board that has viewers', async () => {
    await seedShare({ bob: '', erin: 'view' }, { edit: EDIT, comment: null, view: VIEW });
    const db = as('bob');
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const snap = await tx.get(doc(db, 'shared/s1'));
        tx.update(doc(db, 'shared/s1'), { data: '{"b":1}', client: 'q', rev: Number(snap.data()!.rev) + 1, updatedAt: serverTimestamp() });
      }),
    );
  });
});

describe('comments (shared/{sid}/comments)', () => {
  // The name and photo as on their member record (seedShare gives everyone 'A' and no photo).
  const comment = (author = 'bob', over: object = {}) => ({ card: 'c_1a2b3c4d', text: 'Looks good', author, name: 'A', photo: null, at: serverTimestamp(), resolved: false, ...over });
  const add = (db: Firestore, id: string, c: object) => setDoc(doc(db, `shared/s1/comments/${id}`), c);
  const stored = (author: string) => ({ card: 'c_1', text: 'hi', author, name: 'X', photo: null, at: 1, resolved: false });

  it('editors and commenters can write one as themselves; viewers and outsiders cannot', async () => {
    await seedShare({ bob: 'comment', carol: '', erin: 'view' });
    await assertSucceeds(add(as('bob'), 'k1', comment('bob')));
    await assertSucceeds(add(as('carol'), 'k2', comment('carol')));
    await assertSucceeds(add(as('alice'), 'k3', comment('alice')));
    await assertFails(add(as('erin'), 'k4', comment('erin')));
    await assertFails(add(as('frank'), 'k5', comment('frank')));
    await assertFails(add(as('bob'), 'k6', comment('carol')));
  });

  it('checks every field: known fields only, text 1 to 1,000 characters, a safe card id, the server’s time, not resolved, their own name and photo', async () => {
    await seedShare({ bob: 'comment' });
    const db = as('bob');
    await assertSucceeds(add(db, 'ok', comment('bob', { text: 'x'.repeat(1000) })));
    // As someone else: a name or photo other than on their member record.
    await assertFails(add(db, 'n1', comment('bob', { name: 'Alice' })));
    await assertFails(add(db, 'n2', comment('bob', { photo: 'https://lh3.example/p.png' })));
    await assertFails(add(db, 'k1', comment('bob', { text: '' })));
    await assertFails(add(db, 'k2', comment('bob', { text: 'x'.repeat(1001) })));
    await assertFails(add(db, 'k3', comment('bob', { text: 5 })));
    await assertFails(add(db, 'k4', comment('bob', { card: '../x' })));
    await assertFails(add(db, 'k5', comment('bob', { card: 'x'.repeat(101) })));
    await assertFails(add(db, 'k6', comment('bob', { at: 1 })));
    await assertFails(add(db, 'k7', comment('bob', { resolved: true })));
    await assertFails(add(db, 'k8', comment('bob', { photo: 'http://x' })));
    await assertFails(add(db, 'k9', comment('bob', { name: 'x'.repeat(201) })));
    await assertFails(add(db, 'k10', comment('bob', { foo: 1 })));
    const { card: _card, ...noCard } = comment('bob');
    await assertFails(add(db, 'k11', noCard));
  });

  it('everyone on the board can read them, viewers included (D3); nobody else', async () => {
    await seedShare({ erin: 'view' });
    await seed({ 'shared/s1/comments/c1': stored('alice') });
    await assertSucceeds(getDocs(collection(as('erin'), 'shared/s1/comments')));
    await assertFails(getDocs(collection(as('frank'), 'shared/s1/comments')));
  });

  it('only the resolved fields can change: by an editor on any, by a commenter on their own', async () => {
    await seedShare({ bob: 'comment', carol: 'edit', erin: 'view' });
    await seed({ 'shared/s1/comments/c1': stored('bob'), 'shared/s1/comments/c2': stored('carol') });
    const resolve = (db: Firestore, id: string, over: object = {}) => updateDoc(doc(db, `shared/s1/comments/${id}`), { resolved: true, resolvedAt: serverTimestamp(), ...over });
    await assertFails(resolve(as('bob'), 'c2'));
    await assertFails(resolve(as('erin'), 'c1'));
    await assertFails(resolve(as('bob'), 'c1', { text: 'changed' }));
    await assertFails(resolve(as('bob'), 'c1', { resolvedAt: 5 }));
    await assertFails(resolve(as('bob'), 'c1', { resolved: 'yes' }));
    await assertFails(updateDoc(doc(as('bob'), 'shared/s1/comments/c1'), { text: 'edited' }));
    await assertSucceeds(resolve(as('bob'), 'c1'));
    await assertSucceeds(resolve(as('carol'), 'c1', { resolved: false }));
    await assertSucceeds(resolve(as('alice'), 'c2'));
  });

  it('PR 4, as database.ts writes them: a commenter reopens someone else’s resolved thread by replying (a new comment), not by changing it', async () => {
    await seedShare({ bob: 'comment', carol: 'edit' });
    await seed({ 'shared/s1/comments/c1': { ...stored('carol'), resolved: true, resolvedAt: 5 } });
    await assertSucceeds(add(as('bob'), 'mreply', comment('bob', { card: 'c_1' })));
    await assertFails(updateDoc(doc(as('bob'), 'shared/s1/comments/c1'), { resolved: false, resolvedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('carol'), 'shared/s1/comments/c1'), { resolved: false, resolvedAt: serverTimestamp() }));
  });

  it('PR 4, deleting an account: they find their own comments with a query and delete them; once removed, they can’t', async () => {
    await seedShare({ bob: 'comment' });
    await seed({ 'shared/s1/comments/c1': stored('bob'), 'shared/s1/comments/c2': stored('alice'), 'shared/s1/comments/c3': stored('bob') });
    const db = as('bob');
    const mine = await getDocs(query(collection(db, 'shared/s1/comments'), where('author', '==', 'bob')));
    expect(mine.docs.map((d) => d.id).sort()).toEqual(['c1', 'c3']);
    const b = writeBatch(db);
    mine.docs.forEach((d) => b.delete(d.ref));
    await assertSucceeds(b.commit());
    await assertFails(getDocs(query(collection(as('frank'), 'shared/s1/comments'), where('author', '==', 'frank'))));
  });

  it('only its author or the person who shared the board can delete one', async () => {
    await seedShare({ bob: 'comment', carol: 'edit' });
    await seed({ 'shared/s1/comments/c1': stored('bob'), 'shared/s1/comments/c2': stored('bob') });
    await assertFails(deleteDoc(doc(as('carol'), 'shared/s1/comments/c1')));
    await assertSucceeds(deleteDoc(doc(as('bob'), 'shared/s1/comments/c1')));
    await assertSucceeds(deleteDoc(doc(as('alice'), 'shared/s1/comments/c2')));
  });
});

// Job 161, PR 2: exactly the writes src/sync/database.ts now makes for the Share panel's roles.
describe('the Share panel’s writes (PR 2)', () => {
  /** join as database.ts does: one transaction, their record merged (an existing one keeps its place and old key). */
  function appJoin(db: Firestore, uid: string, key: string, role: string, existing: boolean) {
    return runTransaction(db, async (t) => {
      t.set(doc(db, `shared/s1/joins/${uid}`), { key });
      t.set(doc(db, `shared/s1/members/${uid}`), existing ? { name: 'B', photo: null, role } : { name: 'B', photo: null, role, joinedAt: serverTimestamp() }, { merge: true });
      t.set(doc(db, `boards/${uid}/shared/s1`), { joinedAt: serverTimestamp() });
    });
  }
  /** A transaction that reads the share and its links first, as every one in database.ts does. */
  const tx = (uid: string, fn: (t: Parameters<Parameters<typeof runTransaction>[1]>[0], db: Firestore) => void) => {
    const db = as(uid);
    return runTransaction(db, async (t) => {
      await t.get(doc(db, 'shared/s1'));
      await t.get(doc(db, LINKS));
      fn(t, db);
    });
  };

  it('a newcomer with a view key: edit and comment are refused, view works', async () => {
    await seedShare({}, { edit: EDIT, comment: COMMENT, view: VIEW });
    await assertFails(appJoin(as('bob'), 'bob', VIEW, 'edit', false));
    await assertFails(appJoin(as('bob'), 'bob', VIEW, 'comment', false));
    await assertSucceeds(appJoin(as('bob'), 'bob', VIEW, 'view', false));
  });

  it('someone already on it opening a lower link keeps their role (a record from before roles, with its old key, too)', async () => {
    // Real records hold the time they joined (a merged write keeps it, and the rules check it).
    const at = Timestamp.now();
    await seedShare({}, { edit: EDIT, comment: COMMENT, view: VIEW });
    await seed({
      'shared/s1/members/bob': { name: 'B', photo: null, role: 'comment', joinedAt: at },
      'shared/s1/members/carol': { name: 'C', photo: null, key: 'old-key-0123456789', joinedAt: at },
      'shared/s1/members/dan': { name: 'D', photo: null, role: 'view', joinedAt: at },
    });
    await assertFails(appJoin(as('bob'), 'bob', VIEW, 'edit', true));
    await assertSucceeds(appJoin(as('bob'), 'bob', VIEW, 'comment', true));
    await assertSucceeds(appJoin(as('carol'), 'carol', VIEW, 'edit', true));
    // …and a viewer opening the edit link becomes an editor.
    await assertSucceeds(appJoin(as('dan'), 'dan', EDIT, 'edit', true));
  });

  it('makeLink: the first comment link changes the edit key (moving one out of a share from before); the next one doesn’t', async () => {
    await seed({ 'shared/s1': { ...share, link: 'k' }, 'shared/s1/members/alice': person() });
    await assertSucceeds(
      tx('alice', (t, db) => {
        t.set(doc(db, LINKS), { comment: COMMENT, edit: EDIT }, { merge: true });
        t.update(doc(db, 'shared/s1'), { link: null });
      }),
    );
    await assertSucceeds(tx('alice', (t, db) => t.set(doc(db, LINKS), { view: VIEW }, { merge: true })));
  });

  it('makeLink: the first view link while the edit link is off; the edit link turned on again', async () => {
    await seedShare({}, { edit: null });
    await assertSucceeds(tx('alice', (t, db) => t.set(doc(db, LINKS), { view: VIEW }, { merge: true })));
    await assertSucceeds(tx('alice', (t, db) => t.set(doc(db, LINKS), { edit: EDIT }, { merge: true })));
  });

  it('linksOff: all three off once roles are in use; only the edit link before', async () => {
    await seedShare({}, { edit: EDIT, comment: COMMENT });
    await assertSucceeds(tx('alice', (t, db) => t.set(doc(db, LINKS), { edit: null, comment: null, view: null }, { merge: true })));
    await assertFails(join(as('bob'), 'bob', COMMENT, 'comment'));
    await seed({ 'shared/s1': { ...share, link: 'k' }, [LINKS]: { edit: null } });
    await assertSucceeds(
      tx('alice', (t, db) => {
        t.set(doc(db, LINKS), { edit: null }, { merge: true });
        t.update(doc(db, 'shared/s1'), { link: null });
      }),
    );
  });

  it('setRole: lowering with the links above changed (a key in a share from before moving out); raising with the role alone', async () => {
    await seed({ 'shared/s1': { ...share, link: 'k' }, 'shared/s1/members/alice': person(), 'shared/s1/members/bob': { name: 'B', photo: null, key: 'k', joinedAt: 1 } });
    const db = as('alice');
    await assertSucceeds(
      runTransaction(db, async (t) => {
        await t.get(doc(db, 'shared/s1'));
        await t.get(doc(db, LINKS));
        await t.get(doc(db, 'shared/s1/members/bob'));
        t.update(doc(db, 'shared/s1/members/bob'), { role: 'view' });
        t.set(doc(db, LINKS), { edit: EDIT }, { merge: true });
        t.update(doc(db, 'shared/s1'), { link: null });
      }),
    );
    await assertSucceeds(
      runTransaction(db, async (t) => {
        await t.get(doc(db, 'shared/s1/members/bob'));
        t.update(doc(db, 'shared/s1/members/bob'), { role: 'comment' });
      }),
    );
  });

  it('setRole: lowering on a share with no comment or view link yet also puts roles in use; then an old app can’t join', async () => {
    await seedShare({ bob: 'edit' }, { edit: EDIT });
    const db = as('alice');
    await assertSucceeds(
      runTransaction(db, async (t) => {
        await t.get(doc(db, 'shared/s1'));
        await t.get(doc(db, LINKS));
        await t.get(doc(db, 'shared/s1/members/bob'));
        t.update(doc(db, 'shared/s1/members/bob'), { role: 'view' });
        t.set(doc(db, LINKS), { comment: null, view: null, edit: 'new-edit-0123456789' }, { merge: true });
      }),
    );
    await assertFails(oldJoin(as('carol'), 'carol', 'new-edit-0123456789'));
    await assertSucceeds(join(as('carol'), 'carol', 'new-edit-0123456789'));
  });

  it('removePerson: every link that is on changes, in one transaction', async () => {
    await seedShare({ bob: 'comment' }, { edit: EDIT, comment: COMMENT, view: null });
    await assertSucceeds(
      tx('alice', (t, db) => {
        t.delete(doc(db, 'shared/s1/members/bob'));
        t.delete(doc(db, 'shared/s1/joins/bob'));
        t.set(doc(db, LINKS), { edit: 'new-edit-0123456789', comment: 'new-comment-0123456' }, { merge: true });
      }),
    );
  });
});
