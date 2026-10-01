import { readBoard, serializeBoard } from '../model/persist';
import type { Board } from '../model/types';
import type { Store } from './store';

/** The online copy of the board: the saved board JSON and which open page last wrote it. */
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
    /** Told true when an upload is refused, and false once a later upload is saved. */
    onSaveFailed?: (failed: boolean) => void;
  },
) {
  let ready = false;
  /** Set when the online copy can't be read: nothing more is sent or applied. */
  let stopped = false;
  /**
   * The board JSON last sent or received, so nothing is sent back and forth twice. Received
   * versions are stored as this page would save them, since another page may order fields differently.
   */
  let lastSynced: string | null = null;
  /** An online version that arrived mid-drag: applied once the drag is over. */
  let waiting: Board | null = null;
  let lastBoard = store.getState().board;
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
    if (stopped) return;
    const data = serializeBoard(store.getState().board);
    if (data === lastSynced) return;
    lastSynced = data;
    remote.write({ data, client: opts.client }).then(
      () => {
        if (!failed || lastSynced !== data) return;
        failed = false;
        opts.onSaveFailed?.(false);
      },
      () => {
        // Not saved online: the next change tries again.
        if (lastSynced === data) lastSynced = null;
        failed = true;
        opts.onSaveFailed?.(true);
      },
    );
  }

  const unsubscribe = store.subscribe(() => {
    const board = store.getState().board;
    if (waiting && !busy()) {
      const remoteBoard = waiting;
      waiting = null;
      // The drag ended with a drop: that is newer than the waiting version, so it wins and is uploaded.
      if (board === lastBoard) return store.replaceBoard(remoteBoard);
    }
    if (board === lastBoard) return;
    lastBoard = board;
    if (!ready || stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(upload, SYNC_DELAY);
  });

  /** Reads an online version; if it can't be read, stops syncing and reports it. */
  function read(data: string) {
    const board = readBoard(data);
    if (board) return board;
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
      const board = read(doc.data);
      if (!board) return;
      ready = true;
      lastSynced = serializeBoard(board);
      store.replaceBoard(board);
      return opts.onReady();
    }
    // Ignore our own uploads coming back, and everything while this device has unsaved changes.
    if (!doc || doc.client === opts.client || failed) return;
    const board = read(doc.data);
    if (!board) return;
    const data = serializeBoard(board);
    if (data === lastSynced) return;
    // A change made here is still waiting to be uploaded: it is newer, so send it now instead.
    if (timer && serializeBoard(store.getState().board) !== lastSynced) return upload();
    lastSynced = data;
    if (busy()) waiting = board;
    else store.replaceBoard(board);
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
