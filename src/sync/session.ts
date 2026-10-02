import { appStore } from '../store/appStore';
import { startSync, type SaveState } from '../store/sync';
import { boardRemote, signInWithGoogle, signOutUser, watchUser } from './firebase';
import { flushWhenHidden } from './pageHide';

/**
 * checking: finding out whether someone is signed in on this device.
 * loading: signed in, waiting for the board.
 * no-access: signed in with an account the board isn't shared with.
 */
export type SessionStatus = 'checking' | 'signed-out' | 'loading' | 'ready' | 'no-access' | 'error';

let status: SessionStatus = 'checking';
let signInError = '';
/** How saving online is going, and whether this device has a connection. */
let saveState: SaveState = 'saved';
let online = typeof navigator === 'undefined' ? true : navigator.onLine;
const listeners = new Set<() => void>();
let sync: ReturnType<typeof startSync> | null = null;
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
  if (!user) {
    update('signed-out');
    return;
  }
  update('loading');
  sync = startSync(appStore, boardRemote(user.uid), {
    client,
    onReady: () => update('ready'),
    onSaveState: (state) => {
      saveState = state;
      listeners.forEach((l) => l());
    },
    onError: (e) => update((e as { code?: string }).code === 'permission-denied' ? 'no-access' : 'error'),
  });
});

flushWhenHidden(document, window, () => sync?.flush());

for (const event of ['online', 'offline'] as const) {
  window.addEventListener(event, () => {
    online = navigator.onLine;
    listeners.forEach((l) => l());
  });
}

/** The small note by the zoom control (null while the "couldn't save" banner shows instead). */
function saveNote(): string | null {
  if (saveState === 'failed') return null;
  if (!online) return 'Offline. Will save when you’re back online';
  return saveState === 'saving' ? 'Saving…' : 'Saved';
}

export const session = {
  getStatus: () => status,
  getSignInError: () => signInError,
  getSaveFailed: () => saveState === 'failed',
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
    void signOutUser();
  },
};
