import { appStore } from '../store/appStore';
import { startSharing, type Sharing } from '../store/sharing';
import { startSync, type SaveState } from '../store/sync';
import { startVersions } from '../store/versions';
import { collab, joinFromAddress } from './collabSession';
import { boardRemote, collabRemote, signInWithGoogle, signOutUser, versionsRemote, watchUser } from './firebase';
import { flushWhenHidden } from './pageHide';

/**
 * checking: finding out whether someone is signed in on this device.
 * loading: signed in, waiting for the board.
 * no-access: signed in with an account the online rules turn away (firestore.rules).
 */
export type SessionStatus = 'checking' | 'signed-out' | 'loading' | 'ready' | 'no-access' | 'error';

let status: SessionStatus = 'checking';
let signInError = '';
/** How saving online is going, and whether this device has a connection. */
let saveState: SaveState = 'saved';
/** How saving the shared boards is going (owner request: editing together). */
let shareSaveState: SaveState = 'saved';
let online = typeof navigator === 'undefined' ? true : navigator.onLine;
const listeners = new Set<() => void>();
let sync: ReturnType<typeof startSync> | null = null;
let versions: ReturnType<typeof startVersions> | null = null;
let sharing: Sharing | null = null;
/** If the shared boards can't be listed (no connection on a first visit), the person's own boards open anyway after this long. */
const SHARED_WAIT_MS = 5000;
/** Identifies this open page, so it can ignore its own uploads when they come back. */
const client = crypto.randomUUID();

function update(next: SessionStatus, error = '') {
  status = next;
  signInError = error;
  listeners.forEach((l) => l());
}

watchUser((user) => {
  sync?.stop();
  sync = null;
  versions?.stop();
  versions = null;
  sharing?.stop();
  sharing = null;
  collab.set(null, null);
  if (!user) {
    update('signed-out');
    return;
  }
  update('loading');
  // Shared boards first (owner request: editing together): the person's own boards are synced
  // without them, so it must be known which boards are shared before those are.
  const backend = collabRemote(user);
  let started = false;
  const startOwnBoards = () => {
    if (started || sharing !== active) return;
    started = true;
    sync = startSync(appStore, boardRemote(user.uid), {
      client,
      isShared: (id) => active.isShared(id),
      onReady: () => {
        // Version history starts once the online board is in, so its arrival isn't taken for an edit.
        versions = startVersions(appStore, versionsRemote(user.uid));
        update('ready');
        joinFromAddress(appStore, active);
      },
      onSaveState: (state) => {
        saveState = state;
        listeners.forEach((l) => l());
      },
      onError: (e) => update((e as { code?: string }).code === 'permission-denied' ? 'no-access' : 'error'),
    });
  };
  const active = startSharing(appStore, backend, {
    client,
    storage: localStorage,
    onReady: startOwnBoards,
    onSaveState: (state) => {
      shareSaveState = state;
      listeners.forEach((l) => l());
    },
    onNotice: collab.setNotice,
  });
  sharing = active;
  collab.set(active, backend.me);
  setTimeout(startOwnBoards, SHARED_WAIT_MS);
});

flushWhenHidden(document, window, () => {
  sync?.flush();
  sharing?.flush();
});

for (const event of ['online', 'offline'] as const) {
  window.addEventListener(event, () => {
    online = navigator.onLine;
    if (online) sharing?.retry();
    listeners.forEach((l) => l());
  });
}

/** The small note by the zoom control (null while the "couldn't save" banner shows instead). */
function saveNote(): string | null {
  if (saveState === 'failed' || shareSaveState === 'failed') return null;
  if (!online) return 'Offline. Will save when you’re back online';
  return saveState === 'saving' || shareSaveState === 'saving' ? 'Saving…' : 'Saved';
}

export const session = {
  getStatus: () => status,
  getSignInError: () => signInError,
  getSaveFailed: () => saveState === 'failed' || shareSaveState === 'failed',
  getSaveNote: saveNote,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  signIn() {
    signInWithGoogle().catch((e: { code?: string }) => {
      // Closing the Google window isn't an error worth showing.
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
      update('signed-out', 'Sign-in didn’t work. Check your connection and try again.');
    });
  },
  signOut() {
    sync?.flush();
    sharing?.flush();
    void signOutUser();
  },
};
