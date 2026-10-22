import { deleteUser, type User } from 'firebase/auth';
import {
  addDoc,
  clearIndexedDbPersistence,
  collection,
  deleteDoc,
  deleteField,
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
  type DocumentData,
  type DocumentSnapshot,
  type QuerySnapshot,
  type Transaction,
} from 'firebase/firestore';
import type { AccountBackend } from '../store/account';
import { NO_LINKS, personFrom, ROLES, type CollabBackend, type Links, type NewKeys, type Role, type ShareDoc } from '../store/collab';
import type { Remote } from '../store/sync';
import type { VersionStore } from '../store/versions';
import { app } from './firebase';

// Firebase's database (Firestore): loaded only once someone is signed in (job 169), so the sign-in
// screen downloads only Firebase's sign-in code. session.ts brings it in with import('./database').

// Keeps a copy on the device, so the board opens and can be edited offline;
// changes made offline are uploaded when the connection returns.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

/**
 * Deleting `user`'s account (job #63): everything under boards/{uid} (their boards, version history
 * and list of shares), the shares they shared and their records on the others (through `shares`),
 * and the sign-in. Their boards first get a marker set by this page (`client`), replaced once the shares
 * are dealt with by one that says it is done, holds no boards and stays (review 137-A H5; firestore.rules). Reads go to the server, so
 * without a connection it fails at once rather than working from the offline copy.
 */
// simple: a connection lost part-way leaves the deletes already sent waiting until it is back (the
// panel keeps saying "Deleting…"); they then finish, and running it again is fine.
export function accountRemote(user: User, shares: CollabBackend, client: string): AccountBackend {
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
    async markDeleting() {
      if ((await getDocFromServer(own)).data()?.deleting === 'done') return;
      await setDoc(own, { deleting: 'started', client, updatedAt: serverTimestamp() }, { merge: true });
    },
    unmarkDeleting() {
      updateDoc(own, { deleting: deleteField() }).catch(() => {
        // Refused (no boards in it) or not sent: this page's sync puts its boards back instead.
      });
    },
    async deleteOwnData() {
      const subs = await Promise.all(['versions', 'versionData', 'shared'].map((name) => getDocsFromServer(collection(own, name))));
      const refs = subs.flatMap((s) => s.docs.map((d) => d.ref));
      // A batch takes at most 500 writes.
      for (let i = 0; i < refs.length; i += 400) {
        const batch = writeBatch(db);
        refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
    },
    markDeleted: () => setDoc(own, { deleting: 'done', client, updatedAt: serverTimestamp() }),
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
          // The account being deleted (review 137-A H5): passed on once the server has it, like a board
          // (an unsent one is skipped below, as `data` is null or the page has opened).
          const deleting = d?.deleting === 'started' || d?.deleting === 'done' ? (d.deleting as 'started' | 'done') : null;
          // Our own write, not yet confirmed by the server: skipped, except to open the board. Saves
          // this device hadn't sent when it was last closed stay unconfirmed while offline, so the
          // board opens from them (job 92: it stayed on "Opening your board…"); they are its newest
          // copy, and the server ends up with them once they arrive. They are marked `pending`.
          // simple: an unsent delete (or anything but a board) is skipped, so it is never taken for
          // "no board" (which would upload this device's boards again); reopened offline it still
          // waits on "Opening your board…". Only deleting the account makes one.
          if (pending && (opened || data === null || deleting)) return;
          // "No board" from the offline copy may just mean it hasn't been downloaded yet.
          if (!d && snap.metadata.fromCache) return;
          opened = true;
          if (deleting) return onChange({ data: data ?? '', client: String(d?.client ?? ''), deleting, ...(snap.metadata.fromCache ? { cached: true as const } : {}) });
          onChange(
            data === null
              ? null
              : { data, client: String(d?.client ?? ''), ...(pending ? { pending: true } : {}), ...(snap.metadata.fromCache ? { cached: true } : {}) },
          );
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
        return { id: d.id, savedAt: Number(v.savedAt), cards: Number(v.cards ?? 0), columns: Number(v.columns ?? 0), ...(typeof v.boards === 'number' ? { boards: v.boards } : {}), ...(typeof v.hash === 'string' ? { hash: v.hash } : {}), ...(v.kind === 'outside' ? { kind: v.kind } : {}) };
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
      batch.set(doc(metas, meta.id), { savedAt: meta.savedAt, cards: meta.cards, columns: meta.columns, ...(meta.boards ? { boards: meta.boards } : {}), ...(meta.hash ? { hash: meta.hash } : {}), ...(meta.kind ? { kind: meta.kind } : {}) });
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
 * serializeShare) with who shared them and the shared board; shared/{id}/private/links the link key
 * (job 161: only editors can read it; a share from before keeps it in shared/{id} `link` until it
 * changes); shared/{id}/members/{uid} everyone who has it, with their role; shared/{id}/joins/{uid}
 * the key each person joined with (read by nobody); boards/{uid}/shared/{id} the shares each person
 * has. firestore.rules lets only members read a shared board, only editors change it, and someone
 * join only with a current link's key, with the role of that link.
 */
export function collabRemote(user: User): CollabBackend {
  const me = personFrom(user);
  const shareRef = (id: string) => doc(db, 'shared', id);
  const linksRef = (id: string) => doc(db, 'shared', id, 'private', 'links');
  const memberRef = (id: string, uid: string) => doc(db, 'shared', id, 'members', uid);
  const joinRef = (id: string, uid: string) => doc(db, 'shared', id, 'joins', uid);
  const mineRef = (id: string) => doc(db, 'boards', me.uid, 'shared', id);
  const notAllowed = () => Object.assign(new Error('Not allowed'), { code: 'permission-denied' });
  /** A member record's role (none, from before roles, or one not known, is edit, as in the rules). */
  const roleOf = (d: DocumentData | undefined): Role => (ROLES.includes(d?.role) ? d!.role : 'edit');
  /** The links record's keys (only text counts) and whether roles are in use (a comment or view field is there). */
  const linksIn = (d: DocumentData | undefined): Links => {
    const key = (r: Role) => (typeof d?.[r] === 'string' ? (d[r] as string) : null);
    return { edit: key('edit'), comment: key('comment'), view: key('view'), roles: Boolean(d && ('comment' in d || 'view' in d)) };
  };
  /**
   * In a transaction: the share (refused as "not allowed" once it is gone), its links, and a key
   * still kept in the share itself (one from before, counted as the edit key).
   */
  async function readLinks(tx: Transaction, id: string) {
    const snap = await tx.get(shareRef(id));
    if (!snap.exists()) throw notAllowed();
    const old = typeof snap.data().link === 'string' ? (snap.data().link as string) : null;
    const links = linksIn((await tx.get(linksRef(id))).data());
    return { links: { ...links, edit: links.edit ?? old }, old };
  }
  /**
   * In a transaction: every link of `roles` that is on gets its key from `keys`, a key still in the
   * share moving to the private record with it (job 161).
   */
  function changeLinks(tx: Transaction, id: string, now: { links: Links; old: string | null }, roles: readonly Role[], keys: NewKeys) {
    const next = Object.fromEntries(roles.filter((r) => now.links[r] !== null).map((r) => [r, keys[r]]));
    if (Object.keys(next).length) tx.set(linksRef(id), next, { merge: true });
    if (now.old && 'edit' in next) tx.update(shareRef(id), { link: null });
  }
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
      /** The share, with the key still kept in it (one from before), if any. */
      let last: (Omit<ShareDoc, 'links'> & { link: string | null }) | null = null;
      // The links in the private record (each null while off; the edit key may still be kept in the
      // share: one from before), once that record has answered. Till then they aren't given as off
      // (undefined: the last ones stay), so a click on "Turn links on" can't replace a working link.
      let known = false;
      let got: Links = NO_LINKS;
      const send = () => {
        if (!last) return;
        const { link, ...share } = last;
        onChange({ ...share, links: known ? { ...got, edit: got.edit ?? link } : link ? { ...NO_LINKS, edit: link } : undefined });
      };
      const stopShare = watchAllowed(
        (next, refused) => onSnapshot(shareRef(id), next, refused),
        (snap: DocumentSnapshot) => {
          if (!snap.exists()) {
            // "Not there" from the offline copy may just mean it hasn't been downloaded yet.
            if (!snap.metadata.fromCache) onChange(null);
            return;
          }
          const d = snap.data();
          if (typeof d.data !== 'string' || typeof d.root !== 'string') return;
          last = { owner: String(d.owner), root: d.root, link: typeof d.link === 'string' ? d.link : null, data: d.data, client: String(d.client ?? ''), rev: Number(d.rev ?? 0) };
          send();
        },
        onError,
      );
      // Refused (not an editor, or no longer on it): no key from it; losing the board itself is left
      // to the share's own watch above to report.
      const stopLinks = watchAllowed(
        (next, refused) => onSnapshot(linksRef(id), next, refused),
        (snap: DocumentSnapshot) => {
          // "Not there" from the offline copy may just mean it hasn't been downloaded yet.
          if (!snap.exists() && snap.metadata.fromCache) return;
          known = true;
          got = linksIn(snap.data());
          send();
        },
        () => {
          known = true;
          got = NO_LINKS;
          send();
        },
      );
      return () => {
        stopShare();
        stopLinks();
      };
    },
    watchPeople(id, onChange, onError) {
      return watchAllowed(
        (next, refused) => onSnapshot(collection(db, 'shared', id, 'members'), next, refused),
        (snap: QuerySnapshot) => {
          const when = (x: unknown) => (x as { toMillis?: () => number } | null)?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
          const people = snap.docs
            .map((d) => ({ uid: d.id, name: String(d.data().name ?? ''), photo: typeof d.data().photo === 'string' && (d.data().photo as string).startsWith('https://') ? (d.data().photo as string) : null, role: roleOf(d.data()), at: when(d.data().joinedAt) }))
            .sort((a, b) => a.at - b.at)
            .map(({ uid, name, photo, role }) => ({ uid, name, photo, role }));
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
      batch.set(shareRef(id), { owner: me.uid, root, link: null, data, client, rev: 1, updatedAt: serverTimestamp() });
      batch.set(linksRef(id), { edit: link });
      batch.set(memberRef(id, me.uid), { name: me.name, photo: me.photo, role: 'edit', joinedAt: serverTimestamp() });
      batch.set(mineRef(id), { joinedAt: serverTimestamp() });
      await batch.commit();
    },
    async join(id, key) {
      // Whether this join adds them (owner decision, 2026-10-18), asked of the server before joining:
      // only members may read a member record, so "not allowed" means they weren't on it.
      // simple: any other answer (offline, say) counts as "maybe on it": nobody is taken off then, so
      // a newcomer could stay on a refused share, invisible (rare); and the read and the write are two
      // steps, so a join from another tab in between isn't seen. Upgrade if either shows up.
      const had = await getDocFromServer(memberRef(id, me.uid)).then(
        (snap) => (snap.exists() ? roleOf(snap.data()) : null),
        (e: unknown) => ((e as { code?: string }).code === 'permission-denied' ? null : undefined),
      );
      // The key goes in a record nobody can read, in the same step (job 161): the rules check it there
      // and allow only the role of that key. Which role that is only the rules know (the links are
      // hidden from all but editors), so each is tried from the highest down, stopping at the role
      // the person already has: their own record may always be written again with it, so opening a
      // lower-role link never lowers them.
      // simple: up to three tries (each refused one is a round trip); a hint in the link would save
      // them, at the cost of links people could edit. Upgrade if joining feels slow.
      const tries = had ? ROLES.slice(0, ROLES.indexOf(had) + 1) : ROLES;
      let refused: unknown = notAllowed();
      for (const role of tries) {
        const batch = writeBatch(db);
        batch.set(joinRef(id, me.uid), { key });
        // Merged: someone already on it keeps their place in the list, and an old key the rules want unchanged.
        batch.set(memberRef(id, me.uid), had ? { name: me.name, photo: me.photo, role } : { name: me.name, photo: me.photo, role, joinedAt: serverTimestamp() }, { merge: true });
        batch.set(mineRef(id), { joinedAt: serverTimestamp() });
        try {
          await batch.commit();
          return had === null;
        } catch (e) {
          if ((e as { code?: string }).code !== 'permission-denied') throw e;
          refused = e;
        }
      }
      throw refused;
    },
    async leave(id) {
      // One batch (main session check, 2026-10-06): off the board and off their list together, or
      // neither, so leaving never half works. The rules let a person delete their own member record
      // even once the board is deleted or they were removed (deleting a missing record is fine).
      const batch = writeBatch(db);
      batch.delete(memberRef(id, me.uid));
      batch.delete(joinRef(id, me.uid));
      batch.delete(mineRef(id));
      await batch.commit();
    },
    removePerson(id, uid, keys) {
      // One transaction: removed and every link that is on changed together, or neither; which links
      // are on is read online, so a link turned off on another device stays off.
      return runTransaction(db, async (tx) => {
        const now = await readLinks(tx, id);
        tx.delete(memberRef(id, uid));
        tx.delete(joinRef(id, uid));
        changeLinks(tx, id, now, ROLES, keys);
      });
    },
    makeLink(id, role, keys) {
      return runTransaction(db, async (tx) => {
        const now = await readLinks(tx, id);
        const next: Partial<Record<Role, string>> = { [role]: keys[role] };
        // D1: the first comment or view link changes an edit link that is on, in the same step.
        if (role !== 'edit' && !now.links.roles && now.links.edit !== null) next.edit = keys.edit;
        tx.set(linksRef(id), next, { merge: true });
        if (now.old && next.edit) tx.update(shareRef(id), { link: null });
      });
    },
    linksOff(id) {
      return runTransaction(db, async (tx) => {
        const now = await readLinks(tx, id);
        // Before roles are in use no comment or view field is added (that would shut out the app from before roles).
        tx.set(linksRef(id), now.links.roles ? { edit: null, comment: null, view: null } : { edit: null }, { merge: true });
        if (now.old) tx.update(shareRef(id), { link: null });
      });
    },
    setRole(id, uid, role, keys) {
      return runTransaction(db, async (tx) => {
        const now = await readLinks(tx, id);
        const member = await tx.get(memberRef(id, uid));
        if (!member.exists()) throw notAllowed();
        const had = roleOf(member.data());
        if (had === role) return;
        tx.update(memberRef(id, uid), { role });
        // Lowered: the links above the new role that are on change (they may have seen them).
        if (ROLES.indexOf(role) > ROLES.indexOf(had)) changeLinks(tx, id, now, ROLES.slice(0, ROLES.indexOf(role)), keys);
      });
    },
    async deleteShare(id) {
      // Its member, joins and links records go with it (security review fix), so if its id were ever
      // used again they wouldn't let anyone into the new one; so do its comments. Comments and joins
      // records first, a batch at a time (a batch takes at most 500 writes); then the rest in one go.
      const [members, comments] = await Promise.all([getDocs(collection(db, 'shared', id, 'members')), getDocs(collection(db, 'shared', id, 'comments'))]);
      const first = [...comments.docs.map((c) => c.ref), ...members.docs.map((m) => joinRef(id, m.id))];
      for (let i = 0; i < first.length; i += 400) {
        const some = writeBatch(db);
        first.slice(i, i + 400).forEach((ref) => some.delete(ref));
        await some.commit();
      }
      const batch = writeBatch(db);
      for (const m of members.docs) batch.delete(m.ref);
      batch.delete(linksRef(id));
      batch.delete(shareRef(id));
      await batch.commit();
      await deleteDoc(mineRef(id)).catch(() => {});
    },
  };
}
