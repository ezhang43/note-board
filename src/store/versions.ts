import type { StorageLike } from '../model/persist';
import { readBoard, serializeBoard } from '../model/persist';
import { KEEP_VERSIONS, LOCAL_KEEP_VERSIONS, RETRY_MS, contentHash, needsVersion, summarize, versionsToDrop, type VersionMeta } from '../model/versions';
import type { Store } from './store';

// Version history (owner request, like Google Docs). When editing starts after a quiet spell, the
// board as it was just before is saved as a version; the live board is always the current version.
// Versions live online on the published site (shared by phone and computer), on this device otherwise.

/** Where versions are kept: Firestore on the published site, this device's storage otherwise. */
export interface VersionStore {
  /** Every saved version, newest first (without the boards themselves). */
  list(): Promise<VersionMeta[]>;
  /** A version's board JSON, or null if it's gone. */
  get(id: string): Promise<string | null>;
  save(meta: VersionMeta, data: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** How many versions to keep (default KEEP_VERSIONS). */
  keep?: number;
}

const LIST_KEY = 'note-board:versions:v1';
const dataKey = (id: string) => `note-board:version:${id}`;

/** Versions kept in this device's storage (local-only use and tests). */
export function localVersionStore(storage: StorageLike & { removeItem?(key: string): void }, keep = LOCAL_KEEP_VERSIONS): VersionStore {
  const read = (): VersionMeta[] => {
    try {
      const list = JSON.parse(storage.getItem(LIST_KEY) ?? '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };
  return {
    keep,
    list: async () => read().sort((a, b) => b.savedAt - a.savedAt),
    get: async (id) => storage.getItem(dataKey(id)),
    async save(meta, data) {
      storage.setItem(dataKey(meta.id), data);
      storage.setItem(LIST_KEY, JSON.stringify([...read().filter((v) => v.id !== meta.id), meta]));
    },
    async remove(id) {
      storage.removeItem?.(dataKey(id));
      storage.setItem(LIST_KEY, JSON.stringify(read().filter((v) => v.id !== id)));
    },
  };
}

let current: VersionStore | null = null;
/** The version store in use now (null until one is started), for the history panel. */
export const activeVersionStore = () => current;

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Save `data` as a version, unless it is the same as the newest one; then drop the oldest past the
 * limit. `list`: the versions as just read, if at hand (saves reading them again).
 */
async function saveVersion(versions: VersionStore, data: string, savedAt: number, list?: VersionMeta[]) {
  const known = list ?? (await versions.list());
  const [newest] = known;
  const hash = contentHash(data);
  // Versions saved before fingerprints existed are compared the slow way, by downloading them.
  if (newest && (newest.hash ? newest.hash === hash : (await versions.get(newest.id)) === data)) return null;
  const board = readBoard(data);
  if (!board) return null;
  const meta: VersionMeta = { id: newId(), savedAt, ...summarize(board), hash };
  await versions.save(meta, data);
  for (const id of versionsToDrop([meta, ...known], versions.keep ?? KEEP_VERSIONS)) await versions.remove(id);
  return meta;
}

/**
 * Watch the store and save versions into `versions`. Only changes made on this page count: a board
 * arriving from another device is that device's to save. Saving failures are ignored (history is
 * a safety net; the board itself is saved separately).
 */
export function startVersions(store: Store, versions: VersionStore, opts: { now?: () => number } = {}) {
  const now = opts.now ?? Date.now;
  current = versions;
  let lastBoard = store.getState().board;
  let seenOutside = store.outsideChanges();
  let seenEdits = store.edits();
  let lastSavedAt: number | null | undefined; // undefined until the list has been read
  let lastEditAt: number | null = null;
  let owed: { data: string; retryAt: number } | null = null;
  let queue = versions.list().then(
    (list) => {
      lastSavedAt = list[0]?.savedAt ?? null;
    },
    () => {
      lastSavedAt = null;
    },
  );

  const unsubscribe = store.subscribe(() => {
    const board = store.getState().board;
    if (board === lastBoard) return;
    const before = lastBoard;
    lastBoard = board;
    if (store.outsideChanges() !== seenOutside) {
      seenOutside = store.outsideChanges();
      return;
    }
    // Blocks re-arranging themselves (e.g. once real heights are known) aren't an edit.
    if (store.edits() === seenEdits) return;
    seenEdits = store.edits();
    const at = now();
    const previousEdit = lastEditAt;
    lastEditAt = at;
    // Decided here without going online, so typing doesn't read the list at every letter. A version
    // that couldn't be saved is owed, and tried again a minute later.
    if (owed ? at < owed.retryAt : lastSavedAt !== undefined && !needsVersion(lastSavedAt, previousEdit, at)) return;
    queue = queue.then(async () => {
      if (lastSavedAt === undefined) return;
      // Versions saved elsewhere (a restore, or another device) count too.
      const list = await versions.list().catch(() => null);
      const latest = list?.[0]?.savedAt ?? null;
      if (latest !== null && (lastSavedAt === null || latest > lastSavedAt)) lastSavedAt = latest;
      if (!owed && !needsVersion(lastSavedAt, previousEdit, at)) return;
      // The board from before the edits began: kept for a retry if this save fails.
      const data = owed?.data ?? serializeBoard(before);
      const savedBefore = lastSavedAt;
      lastSavedAt = at; // so edits made meanwhile don't start saves of their own
      try {
        await saveVersion(versions, data, at, list ?? undefined);
        owed = null;
      } catch {
        lastSavedAt = savedBefore;
        owed = { data, retryAt: at + RETRY_MS };
      }
    });
  });

  return {
    stop() {
      unsubscribe();
      if (current === versions) current = null;
    },
  };
}

/**
 * Put version `id` back as the board. The board as it is now is saved as a version first, so
 * restoring never loses anything (and Ctrl+Z undoes the restore).
 */
export async function restoreVersion(store: Store, versions: VersionStore, id: string, now: () => number = Date.now) {
  const data = await versions.get(id);
  const board = data && readBoard(data);
  if (!board) throw new Error('That version could not be read.');
  await saveVersion(versions, serializeBoard(store.getState().board), now());
  store.restoreBoard(board);
}

/**
 * Put a backup file's board in place of this one (owner request). The board as it is now is saved
 * as a version first (when version history is on), as for restoring a version, so it is never
 * lost even after undo history is gone. Returns false, changing nothing, if `text` isn't a backup.
 */
export async function restoreFromBackup(store: Store, versions: VersionStore | null, text: string, now: () => number = Date.now) {
  if (!store.isBackup(text)) return false;
  // Saving the version may fail (offline): the restore still goes ahead, and Ctrl+Z still undoes it.
  if (versions) await saveVersion(versions, serializeBoard(store.getState().board), now()).catch(() => null);
  return store.restoreBackup(text);
}
