import { parseBoard, serializeBoard } from '../model/persist';
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
  write(doc: RemoteDoc): void;
}

/** Wait this long after the last board change before uploading, so typing isn't sent on every key. */
export const SYNC_DELAY = 800;

/**
 * Keeps the store's board and the online copy the same. The first online version wins over
 * this device's board; if there is no online copy yet, this device's board is uploaded.
 * After that, the most recent change wins on every device.
 */
export function startSync(
  store: Store,
  remote: Remote,
  opts: { client: string; onReady: () => void; onError: (e: unknown) => void },
) {
  let ready = false;
  /** The board JSON last sent or received, so nothing is sent back and forth twice. */
  let lastSynced: string | null = null;
  /** An online version that arrived mid-drag: applied once the drag is over. */
  let waiting: Board | null = null;
  let lastBoard = store.getState().board;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const busy = () => {
    const ui = store.getState().ui;
    return Boolean(ui.drag || ui.resize || ui.newDrag || ui.itemDrag);
  };

  function upload() {
    if (timer) clearTimeout(timer);
    timer = null;
    const data = serializeBoard(store.getState().board);
    if (data === lastSynced) return;
    lastSynced = data;
    remote.write({ data, client: opts.client });
  }

  const unsubscribe = store.subscribe(() => {
    if (waiting && !busy()) {
      const board = waiting;
      waiting = null;
      store.replaceBoard(board);
      return;
    }
    const board = store.getState().board;
    if (board === lastBoard) return;
    lastBoard = board;
    if (!ready) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(upload, SYNC_DELAY);
  });

  const stopWatching = remote.watch((doc) => {
    if (!ready) {
      ready = true;
      if (doc) {
        lastSynced = doc.data;
        store.replaceBoard(parseBoard(doc.data));
      } else {
        upload();
      }
      opts.onReady();
      return;
    }
    // Ignore our own uploads coming back, and versions we already have.
    if (!doc || doc.client === opts.client || doc.data === lastSynced) return;
    lastSynced = doc.data;
    const board = parseBoard(doc.data);
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
