import { initializeApp } from 'firebase/app';
import { deleteUser, getAuth, GoogleAuthProvider, onAuthStateChanged, reauthenticateWithPopup, signInWithPopup, signOut, type User } from 'firebase/auth';
import { dropAccess, keepAccess, readAccess } from '../model/calendar';
import {
  addDoc,
  clearIndexedDbPersistence,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  initializeFirestore,
  orderBy,
  query,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  runTransaction,
  serverTimestamp,
  setDoc,
  terminate,
  updateDoc,
  waitForPendingWrites,
  writeBatch,
  type DocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore';
import type { AccountBackend } from '../store/account';
import { personFrom, type CollabBackend } from '../store/collab';
import type { Remote } from '../store/sync';
import type { VersionStore } from '../store/versions';

// Not secret: these only say which Firebase project to talk to. The rules in
// firestore.rules decide who may read or write the board.
const app = initializeApp({
  apiKey: 'AIzaSyBHun-34SrmkErUqS25OJax0JCzl2xe4Wo',
  authDomain: 'note-board-a672a.firebaseapp.com',
  projectId: 'note-board-a672a',
  storageBucket: 'note-board-a672a.firebasestorage.app',
  messagingSenderId: '1016497512471',
  appId: '1:1016497512471:web:8b68c1ed7d063aa39cbc52',
});

const auth = getAuth(app);
// Keeps a copy on the device, so the board opens and can be edited offline;
// changes made offline are uploaded when the connection returns.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export type { User };

export function watchUser(onChange: (user: User | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    // Every sign-out or change of person drops the calendar access kept on this device (jobs 103,
    // 107), here because this is loaded at start, before the calendar ever shows (on a phone, in the
    // ⋯ sheet). Firebase tells every tab of the browser, so a sign-out in one drops it in all.
    const uid = user?.uid ?? null;
    readAccess(() => localStorage, uid);
    // simple: moves a copy kept for the tab before job 107 to the device (same checks: same person,
    // over a minute left), so nobody connected is asked again; can go after 2026-11-19.
    const old = readAccess(() => sessionStorage, uid);
    dropAccess(() => sessionStorage);
    if (old) keepAccess(() => localStorage, old);
    onChange(user);
  });
}

export function signInWithGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signOutUser() {
  return signOut(auth);
}

/** The person signed in now, if any. */
export const currentUser = () => auth.currentUser;

/**
 * Asks Google to confirm it is still `user` (Firebase only deletes an account signed in to
 * recently). Call it straight from a click, so the browser allows the Google window.
 */
export function confirmSignIn(user: User) {
  const provider = new GoogleAuthProvider();
  if (user.email) provider.setCustomParameters({ login_hint: user.email });
  return reauthenticateWithPopup(user, provider);
}

/**
 * Deleting `user`'s account (job #63): everything under boards/{uid} (their boards, version history
 * and list of shares), the shares they shared and their records on the others (through `shares`),
 * and the sign-in. The rules in firestore.rules already let a person delete all of it. Reads go to
 * the server, so without a connection it fails at once rather than working from the offline copy.
 */
// simple: a connection lost part-way leaves the deletes already sent waiting until it is back (the
// panel keeps saying "Deleting…"); they then finish, and running it again is fine.
export function accountRemote(user: User, shares: CollabBackend): AccountBackend {
  const own = doc(db, 'boards', user.uid);
  return {
    async myShares() {
      const list = await getDocsFromServer(collection(own, 'shared'));
      return Promise.all(
        list.docs.map(async (d) => {
          try {
            const snap = await getDocFromServer(doc(db, 'shared', d.id));
            return { id: d.id, owner: snap.exists() ? String(snap.data().owner) : null };
          } catch (e) {
            // No longer one of its people (removed): only their own records of it are left to delete.
            if ((e as { code?: string }).code === 'permission-denied') return { id: d.id, owner: null };
            throw e;
          }
        }),
      );
    },
    deleteShare: shares.deleteShare,
    leave: shares.leave,
    async deleteOwnData() {
      const subs = await Promise.all(['versions', 'versionData', 'shared'].map((name) => getDocsFromServer(collection(own, name))));
      const refs = [...subs.flatMap((s) => s.docs.map((d) => d.ref)), own];
      // A batch takes at most 500 writes.
      for (let i = 0; i < refs.length; i += 400) {
        const batch = writeBatch(db);
        refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
    },
    deleteUser: () => deleteUser(user),
  };
}

/**
 * Feedback (owner request, job #69): one note in the feedback collection, with who sent it (so the
 * owner can reply) and when. The rules let a person only add their own; the owner reads them in the
 * Firebase console. Resolves once the server has it; rejects if it is refused.
 */
export function sendFeedback(user: User, text: string) {
  return addDoc(collection(db, 'feedback'), { text, uid: user.uid, email: user.email, sentAt: serverTimestamp() });
}

/** Clears this device's offline copy of the online data (after deleting an account; never fails). */
export async function clearOfflineCopy() {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // Another tab still has it open: it goes with that tab's next sign-in or the browser's data.
  }
}

/** The signed-in person's board, stored as one Firestore document: boards/{uid}. */
export function boardRemote(uid: string): Remote {
  const ref = doc(db, 'boards', uid);
  return {
    watch(onChange, onError) {
      let opened = false;
      return onSnapshot(
        ref,
        { includeMetadataChanges: true },
        (snap) => {
          const pending = snap.metadata.hasPendingWrites;
          const d = snap.exists() ? snap.data() : undefined;
          const data = typeof d?.data === 'string' ? d.data : null;
          // Our own write, not yet confirmed by the server: skipped, except to open the board. Saves
          // this device hadn't sent when it was last closed stay unconfirmed while offline, so the
          // board opens from them (job 92: it stayed on "Opening your board…"); they are its newest
          // copy, and the server ends up with them once they arrive. They are marked `pending`.
          // simple: an unsent delete (or anything but a board) is skipped, so it is never taken for
          // "no board" (which would upload this device's boards again); reopened offline it still
          // waits on "Opening your board…". Only deleting the account makes one.
          if (pending && (opened || data === null)) return;
          // "No board" from the offline copy may just mean it hasn't been downloaded yet.
          if (!d && snap.metadata.fromCache) return;
          opened = true;
          onChange(data === null ? null : { data, client: String(d?.client ?? ''), ...(pending ? { pending: true } : {}) });
        },
        onError,
      );
    },
    write({ data, client }) {
      // Offline, this is queued and resolves once sent; it rejects if Firestore refuses it
      // (too big, or not allowed by the rules).
      return setDoc(ref, { data, client, updatedAt: serverTimestamp() });
    },
  };
}

/**
 * Version history online (owner request), shared by every device: boards/{uid}/versions/{id}
 * holds what the list shows, boards/{uid}/versionData/{id} the board itself, so the list loads
 * quickly. Needs the rules in firestore.rules (they cover everything under boards/{uid}).
 */
export function versionsRemote(uid: string): VersionStore {
  const metas = collection(db, 'boards', uid, 'versions');
  const datas = collection(db, 'boards', uid, 'versionData');
  return {
    async list() {
      const snap = await getDocs(query(metas, orderBy('savedAt', 'desc')));
      return snap.docs.map((d) => {
        const v = d.data();
        return { id: d.id, savedAt: Number(v.savedAt), cards: Number(v.cards ?? 0), columns: Number(v.columns ?? 0), ...(typeof v.boards === 'number' ? { boards: v.boards } : {}), ...(typeof v.hash === 'string' ? { hash: v.hash } : {}) };
      });
    },
    async get(id) {
      const snap = await getDoc(doc(datas, id));
      const data = snap.exists() ? snap.data().data : null;
      return typeof data === 'string' ? data : null;
    },
    async save(meta, data) {
      // Both in one go, so a version in the list always has its board, and offline (when a restore
      // or delete goes ahead without waiting) both are kept on this device until back online.
      const batch = writeBatch(db);
      batch.set(doc(datas, meta.id), { data });
      batch.set(doc(metas, meta.id), { savedAt: meta.savedAt, cards: meta.cards, columns: meta.columns, ...(meta.boards ? { boards: meta.boards } : {}), ...(meta.hash ? { hash: meta.hash } : {}) });
      await batch.commit();
    },
    async remove(id) {
      await deleteDoc(doc(metas, id));
      await deleteDoc(doc(datas, id));
    },
  };
}

/** The longest a refused shared board waits for this device's saves before it is watched again. */
const RECHECK_MS = 10_000;

/**
 * Watches a shared board, or its people, through `listen` (an onSnapshot call), giving `next` each
 * version. Firestore checks the rules when a watch starts, and a share made or joined here shows on
 * this device before the save that makes this person one of its people has reached the server, so
 * the server can refuse the watch for a moment (job 22: a board just shared vanished with "no
 * longer shared with you"). So a refusal before the server has shown it is only passed on if it is
 * refused again once this device's saves have arrived (or after RECHECK_MS, as another tab's saves
 * may never be reported here); till then nothing is said. Once the server has shown it, a refusal
 * is believed at once.
 */
function watchAllowed<S extends { metadata: { fromCache: boolean } }>(listen: (next: (snap: S) => void, refused: (e: { code?: string }) => void) => () => void, next: (snap: S) => void, onError: (e: unknown) => void) {
  let stopped = false;
  let checked = false;
  let stop = () => {};
  const again = () => {
    if (!stopped) start();
  };
  const start = () => {
    stop = listen(
      (snap) => {
        if (!snap.metadata.fromCache) checked = true;
        next(snap);
      },
      (e) => {
        if (e?.code !== 'permission-denied' || checked) return onError(e);
        checked = true;
        void Promise.race([waitForPendingWrites(db), new Promise((done) => setTimeout(done, RECHECK_MS))]).then(again, again);
      },
    );
  };
  start();
  return () => {
    stopped = true;
    stop();
  };
}

/**
 * Shared boards (owner request: editing together). shared/{id} holds the boards (as in
 * serializeShare) with who shared them, the shared board and the link key; shared/{id}/members/{uid}
 * everyone who has it; boards/{uid}/shared/{id} the shares each person has. firestore.rules lets
 * only members read or change a shared board, and someone join only with the current link's key.
 */
export function collabRemote(user: User): CollabBackend {
  const me = personFrom(user);
  const shareRef = (id: string) => doc(db, 'shared', id);
  const memberRef = (id: string, uid: string) => doc(db, 'shared', id, 'members', uid);
  const mineRef = (id: string) => doc(db, 'boards', me.uid, 'shared', id);
  const notAllowed = () => Object.assign(new Error('Not allowed'), { code: 'permission-denied' });
  return {
    me,
    watchMyShares(onChange, onError) {
      // With metadata changes, so the list confirmed by the server arrives after the offline copy's.
      return onSnapshot(
        collection(db, 'boards', me.uid, 'shared'),
        { includeMetadataChanges: true },
        (snap) => onChange(snap.docs.map((d) => d.id).sort(), !snap.metadata.fromCache),
        onError,
      );
    },
    watchShare(id, onChange, onError) {
      return watchAllowed(
        (next, refused) => onSnapshot(shareRef(id), next, refused),
        (snap: DocumentSnapshot) => {
          if (!snap.exists()) {
            // "Not there" from the offline copy may just mean it hasn't been downloaded yet.
            if (!snap.metadata.fromCache) onChange(null);
            return;
          }
          const d = snap.data();
          if (typeof d.data !== 'string' || typeof d.root !== 'string') return;
          onChange({ owner: String(d.owner), root: d.root, link: typeof d.link === 'string' ? d.link : null, data: d.data, client: String(d.client ?? ''), rev: Number(d.rev ?? 0) });
        },
        onError,
      );
    },
    watchPeople(id, onChange, onError) {
      return watchAllowed(
        (next, refused) => onSnapshot(collection(db, 'shared', id, 'members'), next, refused),
        (snap: QuerySnapshot) => {
          const when = (x: unknown) => (x as { toMillis?: () => number } | null)?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
          const people = snap.docs
            .map((d) => ({ uid: d.id, name: String(d.data().name ?? ''), photo: typeof d.data().photo === 'string' && (d.data().photo as string).startsWith('https://') ? (d.data().photo as string) : null, at: when(d.data().joinedAt) }))
            .sort((a, b) => a.at - b.at)
            .map(({ uid, name, photo }) => ({ uid, name, photo }));
          onChange(people);
        },
        onError,
      );
    },
    updateShare(id, change, client) {
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(shareRef(id));
        if (!snap.exists()) throw notAllowed();
        const data = String(snap.data().data);
        const rev = Number(snap.data().rev ?? 0);
        const next = change(data);
        if (next === null || next === data) return { data, rev };
        tx.update(shareRef(id), { data: next, client, rev: rev + 1, updatedAt: serverTimestamp() });
        return { data: next, rev: rev + 1 };
      });
    },
    async createShare(id, root, link, data, client) {
      const batch = writeBatch(db);
      batch.set(shareRef(id), { owner: me.uid, root, link, data, client, rev: 1, updatedAt: serverTimestamp() });
      batch.set(memberRef(id, me.uid), { name: me.name, photo: me.photo, key: link, joinedAt: serverTimestamp() });
      batch.set(mineRef(id), { joinedAt: serverTimestamp() });
      await batch.commit();
    },
    async join(id, key) {
      // Whether this join adds them (owner decision, 2026-10-18), asked of the server before joining:
      // only members may read a member record, so "not allowed" means they weren't on it.
      // simple: any other answer (offline, say) counts as "maybe on it": nobody is taken off then, so
      // a newcomer could stay on a refused share, invisible (rare); and the read and the write are two
      // steps, so a join from another tab in between isn't seen. Upgrade if either shows up.
      const added = await getDocFromServer(memberRef(id, me.uid)).then(
        (snap) => !snap.exists(),
        (e: unknown) => (e as { code?: string }).code === 'permission-denied',
      );
      const batch = writeBatch(db);
      batch.set(memberRef(id, me.uid), { name: me.name, photo: me.photo, key, joinedAt: serverTimestamp() });
      batch.set(mineRef(id), { joinedAt: serverTimestamp() });
      await batch.commit();
      return added;
    },
    async leave(id) {
      // One batch (main session check, 2026-10-06): off the board and off their list together, or
      // neither, so leaving never half works. The rules let a person delete their own member record
      // even once the board is deleted or they were removed (deleting a missing record is fine).
      const batch = writeBatch(db);
      batch.delete(memberRef(id, me.uid));
      batch.delete(mineRef(id));
      await batch.commit();
    },
    removePerson(id, uid, newKey) {
      // One transaction: removed and the link changed together, or neither; whether the link is on
      // is read online, so a link turned off on another device stays off.
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(shareRef(id));
        if (!snap.exists()) throw notAllowed();
        tx.delete(memberRef(id, uid));
        if (typeof snap.data().link === 'string') tx.update(shareRef(id), { link: newKey });
      });
    },
    setLink: (id, key) => updateDoc(shareRef(id), { link: key }),
    async deleteShare(id) {
      // Its member records go with it (security review fix), so if its id were ever used again they
      // wouldn't let anyone into the new one.
      const members = await getDocs(collection(db, 'shared', id, 'members'));
      const batch = writeBatch(db);
      for (const m of members.docs) batch.delete(m.ref);
      batch.delete(shareRef(id));
      await batch.commit();
      await deleteDoc(mineRef(id)).catch(() => {});
    },
  };
}
