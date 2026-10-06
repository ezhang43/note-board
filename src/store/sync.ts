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
    /**
     * False while it isn't known yet which boards are shared (the share list hasn't answered; see
     * sharesKnown below; main session check, 2026-10-06). Until then these may be shared boards, so
     * they are neither uploaded with the person's own boards nor dropped by a version from there:
     * a board that came with a share (`cameWithShare`), and, after the first online version, a board
     * that was in none (made here meanwhile). Any other board here on first load is dropped as usual
     * when there is an online copy (it may be another account's).
     */
    sharesKnown?: boolean;
    /** Whether board `id` is in a share's data kept on this device. */
    cameWithShare?: (boardId: string) => boolean;
  },
) {
  let known = opts.sharesKnown ?? true;
  /** The first online version (or "there is none") has been dealt with. */
  let loaded = false;
  /** Every board id in an online version seen here, or uploaded from here on first load. */
  const online = new Set<string>();
  const cameWithShare = opts.cameWithShare ?? (() => false);
  const isShared = (id: string) => (opts.isShared?.(id) ?? false) || (!known && (cameWithShare(id) || (loaded && !online.has(id))));
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
  /** An online version that arrived mid-drag: applied once the drag is over. */
  let waiting: Workspace | null = null;
  /** The person's own boards here (as ownKey) when `waiting` arrived. */
  let waitingFrom = '';
  let lastBoards = store.workspace().boards;
  /**
   * Whether any board changed since last time (opening another board changes none: which board is
   * open isn't synced).
   */
  let sharesSeen = store.getState().ui.shares;
  const sharedKey = () => JSON.stringify(store.getState().ui.shares.map((s) => s.boards));
  let lastShared = sharedKey();
  /** 'boards': a board changed. 'shared': which boards are shared changed. false: neither. */
  const boardsChanged = (): 'boards' | 'shared' | false => {
    const boards = store.workspace().boards;
    const ids = Object.keys(boards);
    const same = boards === lastBoards || (ids.length === Object.keys(lastBoards).length && ids.every((id) => boards[id] === lastBoards[id]));
    lastBoards = boards;
    if (!same) return 'boards';
    // Which boards are shared changed: the person's own boards to upload change with it (a board
    // just shared leaves them straight away). Only the boards count: a new list of people or a
    // link turned off isn't a change here (main session check: "Saving…" flickered).
    if (store.getState().ui.shares === sharesSeen) return false;
    sharesSeen = store.getState().ui.shares;
    const key = sharedKey();
    if (key === lastShared) return false;
    lastShared = key;
    return 'shared';
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
    const ws = store.workspace();
    const key = ownKey(ws);
    if (key === lastSynced) {
      if (!failed) opts.onSaveState?.('saved');
      return;
    }
    lastSynced = key;
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
    if (timer) clearTimeout(timer);
    timer = setTimeout(upload, SYNC_DELAY);
    if (!failed) opts.onSaveState?.('saving');
  }

  const unsubscribe = store.subscribe(() => {
    const changed = boardsChanged();
    if (waiting && !busy()) {
      const remoteWs = waiting;
      waiting = null;
      // A change to the person's own boards made here during the drag (its drop, or one made while it
      // went on, as a resize can) is newer than the waiting version: it wins and is uploaded.
      // Otherwise (a shared board changed, say, which syncs on its own) the waiting one is shown.
      if (ownKey(store.workspace()) === waitingFrom) return store.replaceWorkspace(withShared(remoteWs));
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
    if (got) Object.keys(got.ws.boards).forEach((id) => online.add(id));
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
        // This device's boards become the online copy (but not ones that came with a share).
        for (const id of Object.keys(store.workspace().boards)) if (!cameWithShare(id)) online.add(id);
        loaded = true;
        upload();
        return opts.onReady();
      }
      const ws = read(doc.data);
      if (!ws) return;
      ready = true;
      lastSynced = ownKey(ws);
      store.replaceWorkspace(withShared(ws));
      loaded = true;
      return opts.onReady();
    }
    // Ignore our own uploads coming back, and everything while this device has unsaved changes.
    if (!doc || doc.client === opts.client || failed) return;
    const ws = read(doc.data);
    if (!ws) return;
    const data = ownKey(ws);
    if (data === lastSynced) return;
    // A change made here is still waiting to be uploaded: it is newer, so send it now instead.
    if (timer && ownKey(store.workspace()) !== lastSynced) return upload();
    lastSynced = data;
    if (busy()) {
      waiting = ws;
      waitingFrom = ownKey(store.workspace());
    } else store.replaceWorkspace(withShared(ws));
  }, opts.onError);

  return {
    /** Upload any waiting change now (used when the page is closed). */
    flush() {
      if (timer) upload();
    },
    /** Which boards are shared is known now: the person's own boards are all synced from here on. */
    sharesKnown() {
      if (known) return;
      known = true;
      if (ready && !stopped && ownKey(store.workspace()) !== lastSynced) schedule();
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      unsubscribe();
      stopWatching();
    },
  };
}
