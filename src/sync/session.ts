import { appStore } from '../store/appStore';
import { boardsInKeptShares, ownBoardsGuard, startSharing, type Sharing } from '../store/sharing';
import { startSync, type SaveState } from '../store/sync';
import { activeVersionStore, startVersions } from '../store/versions';
import { claimDevice, deleteAccountData, OWNER_KEY } from '../store/account';
import { account, finishDeletion, takeDeletedNote } from './account';
import { collab, joinFromAddress } from './collabSession';
import { feedback } from './feedback';
import { confirmSignIn, currentUser, signInWithGoogle, signOutUser, watchUser, type User } from './firebase';
import { flushWhenHidden } from './pageHide';

/** Firebase's database code, downloaded once someone is signed in, so the sign-in screen doesn't carry it (job 169). */
const database = () => import('./database');
/** Starts the download early; a failure shows when the board starts (start). */
const preloadDatabase = () => void database().catch(() => {});

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
/** This page opened just after the person deleted their account: the sign-in screen says so. */
let deleted = takeDeletedNote();
/** Deleting the account is under way: signing out part-way shows nothing till the page reloads. */
let deleting = false;
/** What Firebase says when a sign-in is asked about after the account was deleted. */
const GONE_CODES = ['auth/user-token-expired', 'auth/user-not-found', 'auth/user-disabled'];
/** After the account is marked deleted elsewhere, the sign-in is asked about this often, this many more times. */
const GONE_CHECK_MS = 60_000;
const GONE_CHECKS = 10;
/** The account whose boards this page holds (job #145): as loaded, then whoever it was claimed for. */
let held = (() => {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
})();
// Someone signed in on this device before, so likely still is: the database code comes down
// alongside Firebase's sign-in check rather than after it.
if (held) preloadDatabase();

function update(next: SessionStatus, error = '') {
  status = next;
  signInError = error;
  listeners.forEach((l) => l());
}

/** Stops syncing everything (signed out, or deleting the account). */
function stopAll() {
  sync?.stop();
  sync = null;
  versions?.stop();
  versions = null;
  sharing?.stop();
  sharing = null;
  // Nothing is being saved now, so no "Couldn't save online" from before shows to whoever is next (job 172).
  saveState = shareSaveState = 'saved';
  listeners.forEach((l) => l());
}

/** Goes up on every sign-in, sign-out or change of person, so a start still waiting for the database code can tell it is out of date. */
let turn = 0;

watchUser((user) => {
  turn++;
  stopAll();
  collab.set(null, null);
  feedback.reset();
  if (!user) {
    if (!deleting) update('signed-out');
    return;
  }
  deleted = false;
  void start(user);
});

/** Starts syncing `user`'s boards; `quiet`: the board stays on screen meanwhile (after a failed delete). */
async function start(user: User, quiet = false) {
  if (!quiet) update('loading');
  const mine = turn;
  const db = await database().catch((e: unknown) => {
    // Couldn't be downloaded (offline, and not kept from an earlier visit), or didn't start: nothing starts.
    console.error(e);
    return null;
  });
  if (!db) {
    if (mine === turn) update('error');
    return;
  }
  // Signed out, or someone else signed in, while it was on its way: that start is the one that counts.
  if (mine !== turn) return;
  const { boardRemote, collabRemote, versionsRemote } = db;
  // Boards another account left on this device are kept aside, never shown or uploaded (job #145).
  try {
    claimDevice(appStore, localStorage, user.uid, held);
    held = user.uid;
  } catch {
    // They couldn't be kept aside (storage full): nothing starts, so they stay as they are.
    return update('error');
  }
  // Shared boards first (owner request: editing together): the person's own boards are synced
  // without them, so it must be known which boards are shared before those are.
  const backend = collabRemote(user);
  let started = false;
  // Started by the timer below before the shared boards are known, own-board sync leaves alone the
  // boards that may be shared until they are (main session check, 2026-10-06). The boards of the
  // shares kept on this device are read once, before anything changes them.
  const guard = ownBoardsGuard(appStore, boardRemote(user.uid), (id) => active.isShared(id), boardsInKeptShares(localStorage, user.uid), (ws) => active.ownCopy(ws));
  const startOwnBoards = () => {
    if (started || sharing !== active) return;
    started = true;
    sync = startSync(appStore, guard.remote, {
      client,
      isShared: guard.isShared,
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
      // The account was deleted on another page (job #63; review 137-A H5): own-board sync has stopped
      // or holds its changes, so nothing is put back online. Once Google says the sign-in is gone too,
      // this page signs out with the note; its copy on this device is left as it is. Still there: another
      // tab of this browser is about to delete it (signing out here would sign that tab out too; it
      // signs every tab out by deleting it), or deleting it failed and can be tried again from here.
      // No connection to ask: it stays as it is.
      onGone: () => {
        // simple: set before Google answers, so a tab here signed out by the deleting tab shows the note;
        // after a failed delete, signing out by hand on this page shows it too (until the next sign-in).
        deleted = true;
        const mine = turn;
        const check = (left: number) => {
          user.getIdToken(true).then(
            () => {
              if (left > 0 && mine === turn) setTimeout(() => mine === turn && check(left - 1), GONE_CHECK_MS);
            },
            (e: unknown) => {
              if (!GONE_CODES.includes((e as { code?: string })?.code ?? '') || mine !== turn) return;
              stopAll();
              void signOutUser();
            },
          );
        };
        check(GONE_CHECKS);
      },
    });
  };
  const active = startSharing(appStore, backend, {
    client,
    storage: localStorage,
    onReady: () => {
      guard.known();
      if (started) sync?.sharedChanged();
      else startOwnBoards();
    },
    // Before version history has started (a share gone while the page was closed), straight online.
    versions: () => activeVersionStore() ?? versionsRemote(user.uid),
    onSaveState: (state) => {
      shareSaveState = state;
      listeners.forEach((l) => l());
    },
    onNotice: collab.setNotice,
  });
  sharing = active;
  collab.set(active, backend.me);
  setTimeout(startOwnBoards, SHARED_WAIT_MS);
}

/**
 * Deletes the signed-in person's account and data (job #63): Google confirms it is them, syncing
 * stops (so nothing is sent back meanwhile), everything online is deleted with the sign-in last,
 * then this device is cleared and the page reloads to the sign-in screen. If it fails, syncing
 * starts again and nothing on the device is touched.
 */
async function deleteAccount() {
  const user = currentUser();
  if (!user || !sharing) throw new Error('Not signed in');
  await confirmSignIn(user);
  // Already downloaded when syncing started.
  const { accountRemote, clearOfflineCopy, collabRemote } = await database();
  const backend = collabRemote(user);
  // Changes still waiting are sent first, so if deleting fails and syncing starts again from the
  // online copy, none are lost.
  sync?.flush();
  sharing?.flush();
  stopAll();
  deleting = true;
  let done: { shareIds: string[] };
  try {
    done = await deleteAccountData(user.uid, accountRemote(user, backend, client));
  } catch (e) {
    deleting = false;
    if (currentUser()?.uid === user.uid) void start(user, true);
    else update('signed-out');
    throw e;
  }
  await clearOfflineCopy();
  finishDeletion(appStore, localStorage, user.uid, done.shareIds);
}
account.setRemover(deleteAccount);

// Send feedback (job #69): saved with the signed-in person's uid and email.
feedback.setSender(async (text) => {
  const user = currentUser();
  if (!user) throw new Error('Not signed in');
  await (await database()).sendFeedback(user, text);
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
  /** Whether to say "Your account and data were deleted." on the sign-in screen. */
  wasDeleted: () => deleted,
  getSaveFailed: () => saveState === 'failed' || shareSaveState === 'failed',
  getSaveNote: saveNote,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  signIn() {
    // Downloads while Google's window is open.
    preloadDatabase();
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
