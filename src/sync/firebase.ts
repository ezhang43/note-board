import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  orderBy,
  query,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
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
  return onAuthStateChanged(auth, onChange);
}

export function signInWithGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signOutUser() {
  return signOut(auth);
}

/** The signed-in person's board, stored as one Firestore document: boards/{uid}. */
export function boardRemote(uid: string): Remote {
  const ref = doc(db, 'boards', uid);
  return {
    watch(onChange, onError) {
      return onSnapshot(
        ref,
        { includeMetadataChanges: true },
        (snap) => {
          // Our own write, not yet confirmed by the server.
          if (snap.metadata.hasPendingWrites) return;
          if (!snap.exists()) {
            // "No board" from the offline copy may just mean it hasn't been downloaded yet.
            if (!snap.metadata.fromCache) onChange(null);
            return;
          }
          const d = snap.data();
          onChange(typeof d.data === 'string' ? { data: d.data, client: String(d.client ?? '') } : null);
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
        return { id: d.id, savedAt: Number(v.savedAt), cards: Number(v.cards ?? 0), columns: Number(v.columns ?? 0) };
      });
    },
    async get(id) {
      const snap = await getDoc(doc(datas, id));
      const data = snap.exists() ? snap.data().data : null;
      return typeof data === 'string' ? data : null;
    },
    async save(meta, data) {
      // The board first, so a version in the list always has its board.
      await setDoc(doc(datas, meta.id), { data });
      await setDoc(doc(metas, meta.id), { savedAt: meta.savedAt, cards: meta.cards, columns: meta.columns });
    },
    async remove(id) {
      await deleteDoc(doc(metas, id));
      await deleteDoc(doc(datas, id));
    },
  };
}
