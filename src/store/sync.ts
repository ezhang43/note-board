import { HOME_ID, readWorkspace, serializeWorkspace, type Workspace } from '../model/workspace';
import type { Store } from './store';

/** The online copy of every board: the saved boards' JSON and which open page last wrote it. */
export interface RemoteDoc {
  data: string;
  client: string;
  /**
   * Not on the server yet: saves made on this device (by a page since closed, or another open tab)
   * still on their way. Only ever the first version.
   */
  pending?: true;
  /**
   * From this device's offline copy: the server's may be newer (job #148). Automatic tidying isn't
   * uploaded until the server's copy has come.
   */
  cached?: true;
  /**
   * The marker of the account being deleted (review 137-A H5), set by the page deleting it (`client`):
   * 'started' while it deletes (`data` still holds the boards), 'done' once they are gone (`data` is
   * empty). The online rules let no other page save boards or versions while there is one.
   */
  deleting?: 'started' | 'done';
  /** When the marker was set (ms since 1970, the server's time), if known. */
  since?: number;
}

/** Where the online copy lives (Firestore in the app, a fake in tests). */
export interface Remote {
  /**
   * Calls `onChange` with each new version of the online copy, or null once it is certain
   * there is none yet. The first version may be `pending` (opening offline, or just after a
   * reload). Returns a function that stops watching.
   */
  watch(onChange: (doc: RemoteDoc | null) => void, onError: (e: unknown) => void): () => void;
  /** Resolves once saved online; rejects if the save was refused (stays pending while offline). */
  write(doc: RemoteDoc): Promise<void>;
}

/** How saving online is going (see startSync's onSaveState). */
export type SaveState = 'saving' | 'saved' | 'failed';

/** Wait this long after the last board change before uploading, so typing isn't sent on every key. */
export const SYNC_DELAY = 800;

/**
 * The most characters the online rules accept for the saved boards.
 * simple: copied from `boardText` in firestore.rules (900000), and must match it; change both together
 * (a unit test checks). Firestore's own 1 MiB per document (counted in bytes) isn't checked here.
 */
export const ONLINE_LIMIT = 900_000;

/**
 * How long after it was set another page's 'started' marker holds this page's uploads back: after
 * it, that page is taken to have closed part-way and the boards go online again. The online rules
 * allow that after 10 minutes (firestore.rules); a little to spare for clocks that differ.
 */
export const DELETING_WAIT_MS = 10.5 * 60_000;

/**
 * Keeps the store's board and the online copy the same. The first online version wins over
 * this device's board; if there is no online copy yet, this device's board is uploaded.
 * After that, the most recent change wins on every device: a change made here that hasn't been
 * uploaded yet (or a drop made after another device saved) wins over the other device's version.
 * An online copy this page can't read (damaged, or saved by a newer version of the app) is
 * reported through onError and never shown or overwritten; syncing stops until the page reloads.
 */
export function startSync(
  store: Store,
  remote: Remote,
  opts: {
    client: string;
    onReady: () => void;
    onError: (e: unknown) => void;
    /**
     * How saving online is going: 'saving' while a change waits to upload, 'saved' once it is
     * online, 'failed' when an upload was refused (until a later one is saved).
     */
    onSaveState?: (state: SaveState) => void;
    /**
     * Boards shared with other people (owner request: editing together), or that may be until the
     * shares are known (ownBoardsGuard in sharing.ts). They sync through their share instead, so
     * they are neither uploaded here nor replaced by what arrives here.
     */
    isShared?: (boardId: string) => boolean;
    /**
     * The online boards, once there, are gone (the account was deleted on another device, job #63):
     * syncing has stopped, so they are never put back from here.
     */
    onGone?: () => void;
  },
) {
  const isShared = opts.isShared ?? (() => false);
  /** This person's own boards: every board but the shared ones. */
  const own = (ws: Workspace): Workspace => ({
    home: ws.home,
    boards: Object.fromEntries(Object.entries(ws.boards).filter(([id]) => id === ws.home || !isShared(id))),
  });
  const ownData = (ws: Workspace) => serializeWorkspace(own(ws));
  /**
   * The person's own boards as compared with what was last synced: in id order, so the comparison
   * doesn't depend on the order the boards happen to be in here (what is sent keeps that order).
   */
  const ownKey = (ws: Workspace) => {
    const { boards } = own(ws);
    return serializeWorkspace({ home: ws.home, boards: Object.fromEntries(Object.keys(boards).sort().map((id) => [id, boards[id]])) });
  };
  /** Boards from the online copy, with the shared boards as they are here. */
  const withShared = (ws: Workspace): Workspace => {
    const here = store.workspace().boards;
    const shared = Object.keys(here).filter((id) => id !== ws.home && isShared(id));
    return { home: ws.home, boards: { ...own(ws).boards, ...Object.fromEntries(shared.map((id) => [id, here[id]])) } };
  };
  let ready = false;
  /** Set when the online copy can't be read: nothing more is sent or applied. */
  let stopped = false;
  /**
   * The boards (as ownKey) last sent or received, so nothing is sent back and forth twice. Received
   * versions are stored as this page would save them, since another page may order fields differently.
   */
  let lastSynced: string | null = null;
  /**
   * The person's own boards were changed on this page since they were last sent or received (job #148):
   * only then are they newer than a version arriving. Automatic tidying (blocks drawn at another size
   * here), a version this sync shows, and a change to a shared board don't count.
   */
  let madeHere = false;
  const synced = (key: string | null) => {
    lastSynced = key;
    madeHere = false;
  };
  let seenTidies = store.tidies();
  /** Set while this sync shows a version that arrived: that change isn't made here. */
  let applying = false;
  const show = (ws: Workspace) => {
    applying = true;
    try {
      store.replaceWorkspace(withShared(ws));
    } finally {
      applying = false;
    }
  };
  /** The server's copy (or word that there is none) has come, not just this device's offline copy. */
  let fresh = false;
  /** An online version that arrived mid-drag: applied once the drag is over. */
  let waiting: Workspace | null = null;
  /** The person's own boards here (as ownKey) when `waiting` arrived. */
  let waitingFrom = '';
  let lastBoards = store.workspace().boards;
  /**
   * Which of those boards were shared (once the first online version has come: until then the
   * sharing that answers isShared may not be set up yet, and no change counts as made here).
   */
  let sharedBefore = new Set<string>();
  let sharesSeen = store.getState().ui.shares;
  const sharedKey = () => JSON.stringify(store.getState().ui.shares.map((s) => s.boards));
  let lastShared = sharedKey();
  /**
   * Whether any board changed since last time, or which boards are shared did (opening another
   * board changes none: which board is open isn't synced). 'own' when one of the person's own boards
   * changed, else 'other' (only shared boards, or which boards are shared).
   */
  const boardsChanged = (): 'own' | 'other' | false => {
    const { home, boards } = store.workspace();
    const before = lastBoards;
    lastBoards = boards;
    const ids = boards === before ? [] : [...new Set([...Object.keys(boards), ...Object.keys(before)])].filter((id) => boards[id] !== before[id]);
    // A board that went counts as it was then: a share that ended takes its board away without it being one of theirs.
    const own = (id: string) => id === home || (id in boards ? !isShared(id) : !sharedBefore.has(id));
    const result = ready && ids.some(own) ? 'own' : 'other';
    if (ready) sharedBefore = new Set(Object.keys(boards).filter(isShared));
    if (ids.length) return result;
    // Which boards are shared changed: the person's own boards to upload change with it (a board
    // just shared leaves them straight away). Only the boards count: a new list of people or a
    // link turned off isn't a change here (main session check: "Saving…" flickered).
    if (store.getState().ui.shares === sharesSeen) return false;
    sharesSeen = store.getState().ui.shares;
    const key = sharedKey();
    if (key === lastShared) return false;
    lastShared = key;
    return 'other';
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Another page is deleting the account (see RemoteDoc.deleting): nothing is uploaded meanwhile. */
  let held = false;
  /** Ends `held` if the deleting page's marker is left behind. */
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  const release = () => {
    held = false;
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  };
  /**
   * The last upload was refused: this device's board is newer than the online copy until a later
   * upload succeeds, so versions from elsewhere (including Firestore putting its copy back) are not applied.
   */
  let failed = false;

  const busy = () => {
    const ui = store.getState().ui;
    return Boolean(ui.drag || ui.resize || ui.newDrag || ui.itemDrag);
  };

  function upload() {
    if (timer) clearTimeout(timer);
    timer = null;
    // A newer version waits for a drag to end: this device's boards are older (the drag's own
    // change, if it makes one, is sent after it).
    if (stopped || waiting || held) return;
    const ws = store.workspace();
    const key = ownKey(ws);
    if (key === lastSynced) {
      madeHere = false;
      if (!failed && !unconfirmed) opts.onSaveState?.('saved');
      return;
    }
    synced(key);
    remote.write({ data: ownData(ws), client: opts.client }).then(
      () => {
        // Saved, unless a newer change has started waiting since.
        if (lastSynced !== key || timer) return;
        failed = false;
        opts.onSaveState?.('saved');
      },
      () => {
        // Not saved online: the next change tries again.
        if (lastSynced === key) lastSynced = null;
        failed = true;
        opts.onSaveState?.('failed');
      },
    );
  }

  function schedule() {
    if (!ready || stopped) return;
    if (held) {
      if (!failed) opts.onSaveState?.('saving');
      return;
    }
    // Opened from the offline copy: tidying alone waits for the server's copy, which may be newer.
    if (!fresh && !madeHere) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(upload, SYNC_DELAY);
    if (!failed) opts.onSaveState?.('saving');
  }

  const unsubscribe = store.subscribe(() => {
    const changed = boardsChanged();
    const tidied = store.tidies() !== seenTidies;
    seenTidies = store.tidies();
    if (changed === 'own' && !tidied && !applying) madeHere = true;
    if (waiting && !busy()) {
      const remoteWs = waiting;
      waiting = null;
      // A change to the person's own boards made here during the drag (its drop, or one made while it
      // went on, as a resize can) is newer than the waiting version: it wins and is uploaded.
      // Otherwise (a shared board changed, or blocks were only tidied) the waiting one is shown.
      if (!madeHere || ownKey(store.workspace()) === waitingFrom) return show(remoteWs);
      return schedule();
    }
    if (changed) schedule();
  });

  /**
   * Reads an online version; if it can't be read, stops syncing and reports it. A single board
   * saved by an older version of the app only stands for the home board: the other boards are kept,
   * except on first load, when the online copy wins outright (boards left on this device may be
   * another account's).
   */
  function read(data: string) {
    const got = readWorkspace(data);
    if (got && (!got.legacy || !ready)) return got.ws;
    if (got) {
      const ws = store.workspace();
      return { home: ws.home, boards: { ...ws.boards, [ws.home]: got.ws.boards[HOME_ID] } };
    }
    stopped = true;
    waiting = null;
    if (timer) clearTimeout(timer);
    timer = null;
    opts.onError(new Error('The online board could not be read.'));
    return null;
  }

  /** An online copy has been seen, so "none" later means it was deleted. */
  let seen = false;
  /** Opened from saves not yet on the server (`pending`), and no version has come since. */
  let unconfirmed = false;
  const stopWatching = remote.watch((got) => {
    if (stopped) return;
    let doc = got;
    if (doc?.deleting) {
      const marker = doc;
      // This page's own marker, from deleting that failed: as if there were no online boards, so this
      // page's go back (the rules let only it do that).
      if (marker.deleting === 'started' && marker.client === opts.client) doc = null;
      else {
        // Another page is deleting the account (or did, or got as far as the sign-in): this page's
        // changes wait, and it isn't signed out, since the deleting may yet fail.
        if (timer) clearTimeout(timer);
        timer = null;
        held = true;
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = null;
        if (madeHere && !failed) opts.onSaveState?.('saving');
        if (marker.deleting === 'done') {
          if (!ready) {
            ready = true;
            opts.onReady();
          }
          return opts.onGone?.();
        }
        // Left over 10 minutes, its page is taken to have closed part-way: the boards go back online.
        const wait = Math.max(0, (marker.since ?? Date.now()) + DELETING_WAIT_MS - Date.now());
        holdTimer = setTimeout(() => {
          release();
          lastSynced = null;
          upload();
        }, wait);
        // The boards in it are shown as any version arriving, unless a change made here waits to go (it is newer).
        if (ready && madeHere && ownKey(store.workspace()) !== lastSynced) return;
      }
    } else if (held && doc) {
      // The deleting failed and the boards are back: a change made here meanwhile is the newest.
      release();
      if (madeHere) {
        lastSynced = null;
        return upload();
      }
    }
    const nowFresh = !fresh && !doc?.cached;
    if (nowFresh) fresh = true;
    // Only a version the server has counts: one only on this device may yet be refused.
    if (doc) {
      if (!doc.pending) seen = true;
    } else if (seen) {
      stopped = true;
      waiting = null;
      if (timer) clearTimeout(timer);
      timer = null;
      return opts.onGone?.();
    }
    if (!ready) {
      if (!doc) {
        ready = true;
        upload();
        return opts.onReady();
      }
      const ws = read(doc.data);
      if (!ws) return;
      ready = true;
      synced(ownKey(ws));
      show(ws);
      // Opened from saves not on the server yet (job 92): "Saving…" until they are.
      unconfirmed = Boolean(doc.pending);
      // Over the online limit they will be refused (job 94): shown as a refused upload straight away,
      // kept here, and the next change tries again. Counted in characters as the rules count them.
      // (`.length` is never below that count, so most boards skip the count.)
      if (unconfirmed && doc.data.length > ONLINE_LIMIT && [...doc.data].length > ONLINE_LIMIT) {
        if (timer) clearTimeout(timer);
        timer = null;
        synced(null);
        failed = true;
        opts.onSaveState?.('failed');
      } else if (unconfirmed) opts.onSaveState?.('saving');
      return opts.onReady();
    }
    const wasUnconfirmed = unconfirmed;
    unconfirmed = false;
    // Those saves were refused and there is no online board: upload this page's boards (once), so a
    // refusal shows as with any upload.
    if (!doc && wasUnconfirmed) {
      lastSynced = null;
      return upload();
    }
    // The server's copy has come and is the one this page opened from: tidying done here meanwhile is sent now.
    const sendTidying = () => {
      if (nowFresh && ownKey(store.workspace()) !== lastSynced) schedule();
    };
    // Ignore our own uploads coming back, and everything while this device has unsaved changes.
    if (!doc || doc.client === opts.client || failed) return sendTidying();
    const ws = read(doc.data);
    if (!ws) return;
    const data = ownKey(ws);
    if (data === lastSynced) {
      if (wasUnconfirmed && !timer) opts.onSaveState?.('saved');
      return sendTidying();
    }
    // A change the person made here is still waiting to be uploaded: it is newer, so send it now
    // instead. Tidying alone isn't (job #148): it is dropped, and the arriving version is shown.
    if (timer && madeHere && ownKey(store.workspace()) !== lastSynced) return upload();
    if (timer) {
      clearTimeout(timer);
      timer = null;
      opts.onSaveState?.('saved');
    }
    synced(data);
    if (busy()) {
      waiting = ws;
      waitingFrom = ownKey(store.workspace());
    } else show(ws);
  }, opts.onError);

  return {
    /** Upload any waiting change now (used when the page is closed). */
    flush() {
      if (timer) upload();
    },
    /** Which boards are shared changed without the store showing it: upload the person's own boards if they now differ. */
    sharedChanged() {
      if (ready && !stopped && ownKey(store.workspace()) !== lastSynced) schedule();
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      release();
      unsubscribe();
      stopWatching();
    },
  };
}
