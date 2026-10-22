// Review 181-A M1, M2 and L3: who a member record and a comment say someone is. A member record holds
// the name and photo Google gives that person (their sign-in token), as the app writes them; a photo
// only from Google's photo server; a joinedAt only of the server's time. No comment is added while its
// author's account is being deleted. Every write the published app, and an older copy of it, makes in
// normal use still goes through (so the rules can be pasted before the app ships).
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, runTransaction, serverTimestamp, setDoc, Timestamp, writeBatch, type Firestore } from 'firebase/firestore';
import { describe, it } from 'vitest';
import { as, seed, useRulesEnv } from './env';

useRulesEnv();

const ALICE_PHOTO = 'https://lh3.googleusercontent.com/a/ACg8ocAlice=s96-c';
const BOB_PHOTO = 'https://lh3.googleusercontent.com/a/ACg8ocBob=s96-c';
const alice = () => as('alice', { name: 'Alice Owner', picture: ALICE_PHOTO });
const bob = (profile: { name?: string; picture?: string } = { name: 'Bob Member', picture: BOB_PHOTO }) => as('bob', profile);
const share = { owner: 'alice', root: 'b1', link: null, data: '{}', client: 'p', rev: 1, updatedAt: 1 };
const EDIT = 'edit-key-0123456789';
const COMMENT = 'comment-key-0123456789';
const aliceRecord = { name: 'Alice Owner', photo: ALICE_PHOTO, role: 'edit', joinedAt: Timestamp.fromMillis(1000) };

/** alice's share s1, with comment and edit links on and her own record. */
const seedShare = (more: Record<string, object> = {}) =>
  seed({ 'shared/s1': share, 'shared/s1/private/links': { edit: EDIT, comment: COMMENT, view: null }, 'shared/s1/members/alice': aliceRecord, ...more });

/** bob joins as database.ts does: one transaction, his record merged (a new one gets the server's time). */
function join(db: Firestore, record: object, key = COMMENT, existing = false) {
  return runTransaction(db, async (t) => {
    t.set(doc(db, 'shared/s1/joins/bob'), { key });
    t.set(doc(db, 'shared/s1/members/bob'), existing ? record : { ...record, joinedAt: serverTimestamp() }, { merge: true });
    t.set(doc(db, 'boards/bob/shared/s1'), { joinedAt: serverTimestamp() });
  });
}
const bobAs = (name: string, photo: string | null) => ({ name, photo, role: 'comment' });
const joined = { name: 'Bob Member', photo: BOB_PHOTO, role: 'comment', joinedAt: Timestamp.fromMillis(2000) };

describe('a member record is the person as Google names them (181-A M1)', () => {
  it('joining with the name and photo Google gives them, as the app writes them, goes through', async () => {
    await seedShare();
    await assertSucceeds(join(bob(), bobAs('Bob Member', BOB_PHOTO)));
  });

  it('not with the owner’s name or photo, or any other name than their own', async () => {
    await seedShare();
    await assertFails(join(bob(), bobAs('Alice Owner', BOB_PHOTO)));
    await assertFails(join(bob(), bobAs('Bob Member', ALICE_PHOTO)));
    await assertFails(join(bob(), bobAs('Alice Owner', ALICE_PHOTO)));
    await assertFails(join(bob(), bobAs('Bob', BOB_PHOTO)));
  });

  it('as the app writes them: a photo may be left out, the name is trimmed, cut to 200 characters, or “Someone” when Google has none', async () => {
    await seedShare();
    await assertSucceeds(join(bob(), bobAs('Bob Member', null)));
    await assertSucceeds(join(bob({ name: '  Bob Member ' }), bobAs('Bob Member', null)));
    await assertSucceeds(join(bob({ name: 'x'.repeat(250) }), bobAs('x'.repeat(200), null)));
    await assertSucceeds(join(bob({}), bobAs('Someone', null)));
    await assertFails(join(bob({}), bobAs('Alice Owner', null)));
    await assertFails(join(bob({ name: '   ' }), bobAs('Alice Owner', null)));
  });

  it('a member can’t become the owner later; a new Google name is taken', async () => {
    await seedShare({ 'shared/s1/members/bob': joined });
    await assertFails(setDoc(doc(bob(), 'shared/s1/members/bob'), { name: 'Alice Owner', photo: ALICE_PHOTO }, { merge: true }));
    await assertFails(setDoc(doc(bob({ name: 'Alice Owner' }), 'shared/s1/members/bob'), { name: 'Alice Owner', photo: ALICE_PHOTO }, { merge: true }));
    await assertSucceeds(join(bob({ name: 'Bob Renamed', picture: BOB_PHOTO }), bobAs('Bob Renamed', BOB_PHOTO), COMMENT, true));
  });

  it('joinedAt is only ever the server’s time, so no one sorts ahead of the owner', async () => {
    await seedShare();
    await assertFails(join(bob(), { ...bobAs('Bob Member', BOB_PHOTO), joinedAt: Timestamp.fromMillis(0) }, COMMENT, true));
    await seed({ 'shared/s1/members/bob': joined });
    await assertFails(setDoc(doc(bob(), 'shared/s1/members/bob'), { joinedAt: Timestamp.fromMillis(0) }, { merge: true }));
    // Joining again keeps it, or (an older copy of the app) sets it to now.
    await assertSucceeds(join(bob(), bobAs('Bob Member', BOB_PHOTO), COMMENT, true));
    await assertSucceeds(setDoc(doc(bob(), 'shared/s1/members/bob'), { ...joined, joinedAt: serverTimestamp() }));
  });

  it('sharing a board writes the owner’s own record the same way', async () => {
    const create = (record: object) => {
      const db = alice();
      const b = writeBatch(db);
      b.set(doc(db, 'shared/s1'), { ...share, updatedAt: serverTimestamp() });
      b.set(doc(db, 'shared/s1/members/alice'), { ...record, role: 'edit', joinedAt: serverTimestamp() });
      b.set(doc(db, 'boards/alice/shared/s1'), { joinedAt: serverTimestamp() });
      return b.commit();
    };
    await assertFails(create({ name: 'Someone else', photo: ALICE_PHOTO }));
    await assertSucceeds(create({ name: 'Alice Owner', photo: ALICE_PHOTO }));
  });

  it('an older copy of the app (before roles) still shares and joins: the edit key in the record, the whole record set', async () => {
    const db = alice();
    const b = writeBatch(db);
    b.set(doc(db, 'shared/s2'), { ...share, link: 'k-older-app-key', updatedAt: serverTimestamp() });
    b.set(doc(db, 'shared/s2/members/alice'), { name: 'Alice Owner', photo: ALICE_PHOTO, key: 'k-older-app-key', joinedAt: serverTimestamp() });
    b.set(doc(db, 'boards/alice/shared/s2'), { joinedAt: serverTimestamp() });
    await assertSucceeds(b.commit());
    const oldJoin = () => {
      const db = bob();
      const b = writeBatch(db);
      b.set(doc(db, 'shared/s2/members/bob'), { name: 'Bob Member', photo: BOB_PHOTO, key: 'k-older-app-key', joinedAt: serverTimestamp() });
      b.set(doc(db, 'boards/bob/shared/s2'), { joinedAt: serverTimestamp() });
      return b.commit();
    };
    await assertSucceeds(oldJoin());
    await assertSucceeds(oldJoin());
  });
});

describe('photos only from Google’s photo server (181-A M2)', () => {
  it('a photo elsewhere is refused even when it is the one in their sign-in token', async () => {
    await seedShare();
    const tracker = 'https://tracker.example/pixel.png?who=bob';
    await assertFails(join(bob({ name: 'Bob Member', picture: tracker }), bobAs('Bob Member', tracker)));
    await assertFails(join(bob({ name: 'Bob Member', picture: 'https://lh3.googleusercontent.com.evil.example/a' }), bobAs('Bob Member', 'https://lh3.googleusercontent.com.evil.example/a')));
    await assertSucceeds(join(bob({ name: 'Bob Member', picture: tracker }), bobAs('Bob Member', null)));
  });

  it('older Google photo addresses (lh4, lh5, lh6) are fine', async () => {
    await seedShare();
    const old = 'https://lh5.googleusercontent.com/-abc/AAAAAAAAAAI/photo.jpg';
    await assertSucceeds(join(bob({ name: 'Bob Member', picture: old }), bobAs('Bob Member', old)));
  });
});

describe('comments carry the record’s name and photo, and none while the author’s account is being deleted', () => {
  const comment = (over: object = {}) => ({ card: 'c_1a2b3c4d', text: 'Looks good', author: 'bob', name: 'Bob Member', photo: BOB_PHOTO, at: serverTimestamp(), resolved: false, ...over });
  const add = (db: Firestore, id: string, c: object) => setDoc(doc(db, `shared/s1/comments/${id}`), c);

  it('as on their member record', async () => {
    await seedShare({ 'shared/s1/members/bob': joined });
    await assertSucceeds(add(bob(), 'c1', comment()));
    await assertFails(add(bob(), 'c2', comment({ name: 'Alice Owner', photo: ALICE_PHOTO })));
  });

  it('a photo elsewhere, left in a record from before, isn’t copied into a comment (181-A M2)', async () => {
    const tracker = 'https://tracker.example/pixel.png';
    await seedShare({ 'shared/s1/members/bob': { ...joined, photo: tracker } });
    await assertFails(add(bob(), 'c1', comment({ photo: tracker })));
  });

  it('not while their account is being deleted on another device (181-A L3)', async () => {
    await seedShare({ 'shared/s1/members/bob': joined });
    await seed({ 'boards/bob': { deleting: 'started', client: 'other-page', updatedAt: Timestamp.now() } });
    await assertFails(add(bob(), 'c1', comment()));
    await seed({ 'boards/bob': { data: '{}', client: 'other-page' } });
    await assertSucceeds(add(bob(), 'c2', comment()));
  });
});
