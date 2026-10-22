import type { StorageLike } from '../model/persist';
import { KEEP_VERSIONS, LOCAL_KEEP_VERSIONS, RETRY_MS, VERSION_GAP_MS, contentHash, needsVersion, summarizeWorkspace, versionsToDrop, type VersionMeta } from '../model/versions';
import { readWorkspace, serializeWorkspace, type Workspace } from '../model/workspace';
import { boardRights } from '../model/sharing';
import { collab } from '../sync/collabSession';
import type { Sharing } from './sharing';
import { overLimit } from './sync';
import type { Store } from './store';

// Version history (owner request, like Google Docs). When editing starts after a quiet spell, every
// board as it was just before is saved as a version; the live boards are always the current version.
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
  /** The most characters one version may hold (online, the rules' limit); none on this device. */
  limit?: number;
}

// Review 137-A M6: a version holds every board, shared ones too, so it can pass the online limit
// when the person's own boards don't. Such a version isn't sent (it would only be refused); the
// note says why. simple: shared boards' versions saved apart, so they don't count, is a later job.
export const TOO_BIG_NOTE = 'Your boards are now too big for Version history, so new versions (and copies of deleted boards) aren’t being saved. Removing boards or long notes you don’t need makes room.';
export const TOO_BIG_RESTORE = 'Couldn’t restore it. Your boards are too big for Version history, so they couldn’t be saved first.';
/** Whether `data` (every board) is too big for `versions`. */
export const tooBig = (versions: VersionStore, data: string) => versions.limit !== undefined && overLimit(data, versions.limit);
/** The note, unless another is showing (it may say something more urgent, such as changes not being saved). */
const tellTooBig = () => void (collab.notice() || collab.setNotice(TOO_BIG_NOTE));
/** A restore refused because the boards as they are are too big to keep first. */
export class TooBigError extends Error {
  constructor() {
    super(TOO_BIG_RESTORE);
  }
}
/** Whether every board as it is now is too big for the version history in use (the delete and backup questions say so). */
export const historyFull = (store: Store) => current !== null && tooBig(current, serializeWorkspace(store.workspace()));

export const LIST_KEY = 'note-board:versions:v1';
/**
 * How long a delete or a restore waits for its safety version to be saved. Offline, an
 * online save only answers once back online: the version is still saved then, but the action
 * goes ahead now.
 */
export const VERSION_SAVE_WAIT_MS = 3000;

/**
 * Saves every board as a version, waiting at most VERSION_SAVE_WAIT_MS. The boards are read and the
 * save started straight away (offline, it is then queued on this device and kept over a reload), so
 * what is saved is how they are at the call; the version list is only read after, to drop the copy
 * again if the newest version already has these boards, and the oldest past the limit. Resolves
 * false if the save failed within the wait, true otherwise; `onLateFailure` runs if it fails later.
 */
export async function saveSafetyVersion(store: Store, versions: VersionStore, now: () => number, onLateFailure?: () => void) {
  const version = versionOf(store.workspace(), now());
  if (!version) return true;
  const { meta, data } = version;
  if (tooBig(versions, data)) {
    tellTooBig();
    return false;
  }
  const saving = (async () => versions.save(meta, data))(); // called now; a throw becomes a failed save
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = new Promise<null>((done) => (timer = setTimeout(() => done(null), VERSION_SAVE_WAIT_MS)));
  const saved = await Promise.race([
    saving.then(
      () => tidyAfter(versions, meta, data).then(() => true, () => true),
      () => false,
    ),
    waited,
  ]);
  clearTimeout(timer);
  if (saved !== null) return saved;
  saving.catch(() => onLateFailure?.());
  return true;
}

/** `ws` as a version saved at `savedAt` (`kind`: see VersionMeta), or null if it can't be read back. */
function versionOf(ws: Workspace, savedAt: number, kind?: VersionMeta['kind']): { meta: VersionMeta; data: string } | null {
  const data = serializeWorkspace(ws);
  const got = readWorkspace(data);
  if (!got) return null;
  return { data, meta: { id: newId(), savedAt, ...summarizeWorkspace(got.ws), hash: contentHash(data), ...(kind ? { kind } : {}) } };
}

/**
 * After `meta` is saved: if the newest version saved no later than it has the same boards, the later
 * of the two is removed again (so two same copies answering together keep exactly one, never none);
 * otherwise the oldest past the limit are dropped.
 */
async function tidyAfter(versions: VersionStore, meta: VersionMeta, data: string) {
  const others = (await versions.list()).filter((v) => v.id !== meta.id);
  const before = others.find((v) => v.savedAt <= meta.savedAt);
  if (before && (await sameBoards(versions, before, data))) {
    const later = before.savedAt < meta.savedAt || before.id < meta.id ? meta : before;
    return versions.remove(later.id);
  }
  for (const id of versionsToDrop([meta, ...others], versions.keep ?? KEEP_VERSIONS)) await versions.remove(id);
}

/** Whether version `v` holds exactly `data`. Versions saved before fingerprints existed are downloaded to compare. */
async function sameBoards(versions: VersionStore, v: VersionMeta, data: string) {
  return v.hash ? v.hash === contentHash(data) : (await versions.get(v.id)) === data;
}

export const dataKey = (id: string) => `note-board:version:${id}`;

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
/** A backup of every board is being put in place (see restoreFromBackup): not a change from another device. */
let restoringBackup = false;
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
  if (newest && (await sameBoards(versions, newest, data))) return null;
  const got = readWorkspace(data);
  if (!got) return null;
  const meta: VersionMeta = { id: newId(), savedAt, ...summarizeWorkspace(got.ws), hash: contentHash(data) };
  await versions.save(meta, data);
  for (const id of versionsToDrop([meta, ...known], versions.keep ?? KEEP_VERSIONS)) await versions.remove(id);
  return meta;
}

/**
 * Watch the store and save versions into `versions`. Only changes made on this page count: a board
 * arriving from another device is that device's to save, except that boards edited here are saved
 * just before such a change replaces them (see below). Saving failures are ignored (history is
 * a safety net; the board itself is saved separately).
 */
export function startVersions(store: Store, versions: VersionStore, opts: { now?: () => number } = {}) {
  const now = opts.now ?? Date.now;
  current = versions;
  let lastWs = store.workspace();
  let seenOutside = store.outsideChanges();
  let seenEdits = store.edits();
  let lastSavedAt: number | null | undefined; // undefined until the list has been read
  let lastEditAt: number | null = null;
  let owed: { data: string; retryAt: number } | null = null;
  // Job #147: whether this page has edits no 'outside' version holds yet, and when the last one was kept.
  let unkept = false;
  let lastKeptAt: number | null = null;
  let queue = versions.list().then(
    (list) => {
      lastSavedAt = list[0]?.savedAt ?? null;
    },
    () => {
      lastSavedAt = null;
    },
  );

  const unsubscribe = store.subscribe(() => {
    const ws = store.workspace();
    if (ws === lastWs) return;
    const before = lastWs;
    lastWs = ws;
    if (store.outsideChanges() !== seenOutside) {
      seenOutside = store.outsideChanges();
      // Job #147 (review 137, H3): another device's copy replacing the person's own boards (an old
      // copy a phone saved offline and sent hours later, say) would lose what was edited here since
      // the last such version (an ordinary version holds the boards from before the edits). Those
      // boards are kept as a version first, at most once in 10 minutes (two devices used at once
      // would fill the history otherwise), started straight away, before anything can clear this
      // device. Only boards that were here count, and not shared ones (they sync on their own):
      // a share's boards arriving, or someone else changing one, don't; nor does restoring a backup.
      // simple: a version that can't be saved (over the online limit, or a failed commit) is only
      // logged, not tried again like an ordinary one; give it a retry if that loses work in practice.
      if (!unkept || restoringBackup) return;
      const at = now();
      if (lastKeptAt !== null && at - lastKeptAt < VERSION_GAP_MS) return;
      const shared = new Set(store.getState().ui.shares.flatMap((s) => s.boards));
      if (!Object.keys(before.boards).some((id) => !shared.has(id) && before.boards[id] !== ws.boards[id])) return;
      const version = versionOf(before, at, 'outside');
      if (!version) return;
      const keptBefore = lastKeptAt;
      unkept = false;
      lastKeptAt = at; // also when too big: the note comes back at most once in 10 minutes
      if (tooBig(versions, version.data)) return tellTooBig();
      (async () => versions.save(version.meta, version.data))().then(
        () => tidyAfter(versions, version.meta, version.data).catch(() => {}),
        (e) => {
          unkept = true;
          if (lastKeptAt === at) lastKeptAt = keptBefore;
          console.warn('The boards from before changes from another device couldn’t be saved in Version history.', e);
        },
      );
      return;
    }
    // Blocks re-arranging themselves (e.g. once real heights are known) aren't an edit.
    if (store.edits() === seenEdits) return;
    seenEdits = store.edits();
    const at = now();
    const previousEdit = lastEditAt;
    lastEditAt = at;
    unkept = true;
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
      const data = owed?.data ?? serializeWorkspace(before);
      const savedBefore = lastSavedAt;
      lastSavedAt = at; // so edits made meanwhile don't start saves of their own
      // Not sent, and not tried again until the next version is due (the note would come back at every edit).
      if (tooBig(versions, data)) {
        owed = null;
        return tellTooBig();
      }
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
 * Put version `id` back: the open board as it was then, and any board deleted since. Every board
 * as it is now is saved as a version first, so restoring never loses anything (and Ctrl+Z undoes
 * the restore of the open board). Boards shared with this person by someone else stay as they are:
 * returns those shares' starting boards (see restorable), or [] for a restore dropped because the
 * person moved on while the version was saving. `onLateFailure`: see saveSafetyVersion.
 */
export async function restoreVersion(store: Store, versions: VersionStore, id: string, now: () => number = Date.now, onLateFailure?: () => void) {
  // Shared boards not known yet (job #33): nothing is saved or opened for a restore that won't happen.
  if (!store.getState().ui.sharesKnown) return 'loading';
  // Too big to save first (review 137-A M6): nothing is restored, and the bar says why.
  if (tooBig(versions, serializeWorkspace(store.workspace()))) throw new TooBigError();
  const pressed = store.getState();
  // The safety version's save starts first, at the press, so it is queued on this device even while
  // reading the chosen version waits (just offline). Saving may wait too: the restore goes ahead after
  // at most VERSION_SAVE_WAIT_MS. A save refused before the restore stops it; one refused after it is
  // reported through `onLateFailure`.
  let restored = false;
  let refused = false;
  const saving = saveSafetyVersion(store, versions, now, () => {
    refused = true;
    if (restored) onLateFailure?.();
  });
  const data = await versions.get(id).catch(() => null); // unreadable: see below, once it is known the person is still here
  const saved = await saving;
  // Unless, meanwhile, the person went back (or looked again), picked another version, or another
  // board opened (by them, or by boards arriving from another device): it would replace the wrong board.
  const { ui, boards } = store.getState();
  if (ui.preview !== pressed.ui.preview || boards.open !== pressed.boards.open) return [];
  const got = data ? readWorkspace(data) : null;
  if (!got) throw new Error('That version could not be read.');
  if (!saved || refused) throw new Error('The boards as they are now could not be saved as a version.');
  // A version from before there were several boards is of the home board: home opens to take it.
  const { home } = store.getState().boards;
  if (got.legacy) store.openBoard(home);
  const kept = store.restoreVersion(got.legacy ? { home, boards: { [home]: Object.values(got.ws.boards)[0] } } : got.ws);
  restored = kept !== 'loading';
  return kept;
}

/**
 * Put a backup file in place (owner request): a single board's backup replaces the open board; a
 * backup of every board replaces every board. The board as it is now is saved
 * as a version first (when version history is on), as for restoring a version, so it is never
 * lost even after undo history is gone. Returns false, changing nothing, if `text` isn't a backup;
 * otherwise the starting boards of shares left as they are (see store.restoreBackup).
 */
export async function restoreFromBackup(store: Store, versions: VersionStore | null, text: string, now: () => number = Date.now) {
  if (!store.isBackup(text)) return false;
  if (!store.getState().ui.sharesKnown) return 'loading'; // see restoreVersion
  // Saving the version may fail (offline): the restore still goes ahead, and Ctrl+Z still undoes it.
  if (versions) await saveSafetyVersion(store, versions, now);
  restoringBackup = true; // it saved its own safety version just now
  try {
    return store.restoreBackup(text);
  } finally {
    restoringBackup = false;
  }
}

/**
 * Delete a board (owner request: several boards), if this person may (boardRights). Every board as
 * it is now is saved as a version first (when version history is on), so the deleted board can be
 * brought back from there. A board this person shared is deleted for everyone, through `sharing`.
 */
export async function deleteBoardSafely(store: Store, versions: VersionStore | null, id: string, sharing: Sharing | null = null, now: () => number = Date.now) {
  const { ui, boards } = store.getState();
  if (!boardRights(ui.shares, id, boards.home).delete) return;
  // Saving the version may fail or wait (offline): the board is deleted anyway, as the person asked.
  if (versions) await saveSafetyVersion(store, versions, now);
  const share = ui.shares.find((s) => s.root === id && s.owner);
  if (share && sharing) await sharing.deleteShare(share.id);
  else store.deleteBoard(id);
}
