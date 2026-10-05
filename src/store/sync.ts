import { HOME_ID, readWorkspace, serializeWorkspace, type Workspace } from '../model/workspace';
import type { Store } from './store';

/** The online copy of every board: the saved boards' JSON and which open page last wrote it. */
export interface RemoteDoc {
  data: string;
  client: string;
}

/** Where the online copy lives (Firestore in the app, a fake in tests). */
export interface Remote {
  /**
   * Calls `onChange` with each new version of the online copy, or null once it is certain
   * there is none yet. Returns a function that stops watching.
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
     * Boards shared with other people (owner request: editing together). They sync through their
     * share instead, so they are neither uploaded here nor replaced by what arrives here.
     */
    isShared?: (boardId: string) => boolean;
  },
) {
  const isShared = opts.isShared ?? (() => false);
  /** This person's own boards: every board but the shared ones. */
  const own = (ws: Workspace): Workspace => ({
    home: ws.home,
    boards: Object.fromEntries(Object.entries(ws.boards).filter(([id]) => id === ws.home || !isShared(id))),
  });
  const ownData = (ws: Workspace) => serializeWorkspace(own(ws));
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
   * The board JSON last sent or received, so nothing is sent back and forth twice. Received
   * versions are stored as this page would save them, since another page may order fields differently.
   */
  let lastSynced: string | null = null;
  /** An online version that arrived mid-drag: applied once the drag is over. */
  let waiting: Workspace | null = null;
  let lastBoards = store.workspace().boards;
  /**
   * Whether any board changed since last time (opening another board changes none: which board is
   * open isn't synced).
   */
  let lastShares = store.getState().ui.shares;
  const boardsChanged = () => {
    // Which boards are shared changed: the person's own boards to upload change with it (a board
    // just shared leaves them straight away).
    const shares = store.getState().ui.shares;
    if (shares !== lastShares) {
      lastShares = shares;
      lastBoards = store.workspace().boards;
      return true;
    }
    const boards = store.workspace().boards;
    if (boards === lastBoards) return false;
    const ids = Object.keys(boards);
    const same = ids.length === Object.keys(lastBoards).length && ids.every((id) => boards[id] === lastBoards[id]);
    lastBoards = boards;
    return !same;
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
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
    if (stopped || waiting) return;
    const data = ownData(store.workspace());
    if (data === lastSynced) {
      if (!failed) opts.onSaveState?.('saved');
      return;
    }
    lastSynced = data;
    remote.write({ data, client: opts.client }).then(
      () => {
        // Saved, unless a newer change has started waiting since.
        if (lastSynced !== data || timer) return;
        failed = false;
        opts.onSaveState?.('saved');
      },
      () => {
        // Not saved online: the next change tries again.
        if (lastSynced === data) lastSynced = null;
        failed = true;
        opts.onSaveState?.('failed');
      },
    );
  }

  const unsubscribe = store.subscribe(() => {
    const changed = boardsChanged();
    if (waiting && !busy()) {
      const remoteWs = waiting;
      waiting = null;
      // The drag ended with a drop: that is newer than the waiting version, so it wins and is uploaded.
      if (!changed) return store.replaceWorkspace(withShared(remoteWs));
    }
    if (!changed) return;
    if (!ready || stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(upload, SYNC_DELAY);
    if (!failed) opts.onSaveState?.('saving');
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

  const stopWatching = remote.watch((doc) => {
    if (stopped) return;
    if (!ready) {
      if (!doc) {
        ready = true;
        upload();
        return opts.onReady();
      }
      const ws = read(doc.data);
      if (!ws) return;
      ready = true;
      lastSynced = ownData(ws);
      store.replaceWorkspace(withShared(ws));
      return opts.onReady();
    }
    // Ignore our own uploads coming back, and everything while this device has unsaved changes.
    if (!doc || doc.client === opts.client || failed) return;
    const ws = read(doc.data);
    if (!ws) return;
    const data = ownData(ws);
    if (data === lastSynced) return;
    // A change made here is still waiting to be uploaded: it is newer, so send it now instead.
    if (timer && ownData(store.workspace()) !== lastSynced) return upload();
    lastSynced = data;
    if (busy()) waiting = ws;
    else store.replaceWorkspace(withShared(ws));
  }, opts.onError);

  return {
    /** Upload any waiting change now (used when the page is closed). */
    flush() {
      if (timer) upload();
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      unsubscribe();
      stopWatching();
    },
  };
}
