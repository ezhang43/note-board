import type { StorageLike } from '../model/persist';
import { readBoard, serializeBoard } from '../model/persist';
import { needsVersion, summarize, versionsToDrop, type VersionMeta } from '../model/versions';
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
}

const LIST_KEY = 'note-board:versions:v1';
const dataKey = (id: string) => `note-board:version:${id}`;

/** Versions kept in this device's storage (local-only use and tests). */
export function localVersionStore(storage: StorageLike & { removeItem?(key: string): void }): VersionStore {
  const read = (): VersionMeta[] => {
    try {
      const list = JSON.parse(storage.getItem(LIST_KEY) ?? '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };
  return {
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

/** Save `data` as a version, unless it is the same as the newest one; then drop the oldest past the limit. */
async function saveVersion(versions: VersionStore, data: string, savedAt: number) {
  const [newest] = await versions.list();
  if (newest && (await versions.get(newest.id)) === data) return null;
  const board = readBoard(data);
  if (!board) return null;
  const meta: VersionMeta = { id: newId(), savedAt, ...summarize(board) };
  await versions.save(meta, data);
  for (const id of versionsToDrop(await versions.list())) await versions.remove(id);
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
  let lastSavedAt: number | null | undefined; // undefined until the list has been read
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
    const at = now();
    queue = queue.then(async () => {
      if (lastSavedAt === undefined) return;
      // Versions saved elsewhere (a restore, or another device) count too.
      const latest = (await versions.list().catch(() => []))[0]?.savedAt ?? null;
      if (latest !== null && (lastSavedAt === null || latest > lastSavedAt)) lastSavedAt = latest;
      if (!needsVersion(lastSavedAt, at)) return;
      lastSavedAt = at;
      await saveVersion(versions, serializeBoard(before), at).catch(() => null);
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
