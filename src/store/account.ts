import { planShares, type ShareOwner } from '../model/account';
import { BOARD_KEY, OWNER_KEY, UNREADABLE_KEY, VIEW_KEY, type StorageLike } from '../model/persist';
import { OPEN_BOARD_KEY, parseWorkspace, readWorkspace, serializeWorkspace } from '../model/workspace';
import { ACCESS_KEY } from '../model/calendar';
import { baseKey, commentsSeenKey, ownBoardsKey, sharesKey } from './sharing';
import type { Store } from './store';
import { dataKey, LIST_KEY } from './versions';

export { OWNER_KEY };
/** Where account `uid`'s boards wait on this device while another account uses it (job #145). */
export const parkedKey = (uid: string) => `note-board:parked:${uid}`;
/**
 * Account `uid`'s own-board changes held back while another page deleted the account (review 181-A
 * H1): a fingerprint of the online boards they were made on (see startSync's heldBase).
 */
export const heldKey = (uid: string) => `note-board:held-edits:${uid}`;
/** The last agreed version of each of account `uid`'s shares, kept aside with its boards (see baseKey). */
const parkedBasesKey = (uid: string) => `note-board:parked-bases:${uid}`;

/**
 * Makes the boards on this device account `uid`'s before its sync starts (job #145, review 137-A
 * H2: on a shared computer a new account was given the last person's boards). Boards another
 * account left here are kept aside for it (parkedKey), with the last agreed versions of its shares
 * (so they combine as after a reload), and put back when it signs in here again; `uid` gets its own
 * kept-aside boards, or an empty board, then the online copy as usual. Undo starts over. Boards
 * with no owner kept yet (saved before this) stay with the first account to sign in.
 * `held`: the account whose boards this page holds (another tab may have changed the device's).
 * Throws, changing nothing, when storage is blocked, the other account's boards can't be kept
 * aside (storage full), or `uid`'s kept-aside boards can't be read (saved by a newer version).
 */
export function claimDevice(store: Store, storage: StorageLike & { removeItem(key: string): void }, uid: string, held: string | null) {
  const owner = storage.getItem(OWNER_KEY);
  if (owner && owner !== uid) {
    const parked = storage.getItem(parkedKey(uid));
    const back = parked === null ? parseWorkspace(null) : readWorkspace(parked)?.ws;
    if (!back) throw new Error('The boards kept on this device could not be read.');
    // Saves still waiting on this page, if it holds the boards on the device.
    if (held === owner) store.flush();
    // In this order, so a step that fails (storage full) never leaves the device's boards under the
    // wrong owner, nor the earlier account's boards anywhere but kept aside.
    const boards = storage.getItem(BOARD_KEY);
    const bases: Record<string, string> = {};
    for (const id of listedShares(storage.getItem(sharesKey(owner)))) bases[id] = storage.getItem(baseKey(id)) ?? '';
    if (boards !== null) storage.setItem(parkedKey(owner), boards);
    storage.setItem(parkedBasesKey(owner), JSON.stringify(bases));
    storage.setItem(OWNER_KEY, uid);
    let saved = true;
    try {
      storage.setItem(BOARD_KEY, parked ?? serializeWorkspace(back));
    } catch {
      // Not saved (storage full): the earlier account's copy mustn't stay there either.
      storage.removeItem(BOARD_KEY);
      saved = false;
    }
    let mine: Record<string, unknown> = {};
    try {
      mine = JSON.parse(storage.getItem(parkedBasesKey(uid)) ?? '{}') as Record<string, unknown>;
    } catch {
      // Damaged: those shares are downloaded again.
    }
    for (const [id, base] of Object.entries(mine)) {
      try {
        storage.setItem(baseKey(id), typeof base === 'string' ? base : '');
      } catch {
        storage.removeItem(baseKey(id)); // the other account's version mustn't be taken for this one's
      }
    }
    if (saved) {
      storage.removeItem(parkedKey(uid));
      storage.removeItem(parkedBasesKey(uid));
    }
    store.endPreview();
    store.replaceWorkspace(back);
    store.holdBoardsOf(uid);
  } else {
    if (!owner) {
      try {
        storage.setItem(OWNER_KEY, uid);
      } catch {
        // Storage full: still no owner kept, so the next account to sign in is again taken for the first.
      }
    }
    // Another open tab already made the device `uid`'s: this page's boards are the earlier account's.
    if (held && held !== uid) {
      store.endPreview();
      store.replaceWorkspace(parseWorkspace(storage.getItem(BOARD_KEY)));
    }
    store.holdBoardsOf(uid);
  }
}

/** The share ids on a kept list of shares (see sharesKey); none if it is damaged. */
function listedShares(list: string | null): string[] {
  try {
    const got = JSON.parse(list ?? '[]') as unknown;
    return Array.isArray(got) ? got.map((x) => (x as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

// Deleting your account and data (job #63, required by Google Play). Firestore on the published
// site (src/sync/database.ts), the pretend sharing server for demo people (src/sync/demo.ts).

/** Where a person's account lives online. Every call is fine to make again after it worked. */
export interface AccountBackend {
  /** Every share on this person's list, with who shared it (null: gone or no longer readable). */
  myShares(): Promise<ShareOwner[]>;
  /** A board they shared: deleted for everyone, with its records of who has it. */
  deleteShare(id: string): Promise<void>;
  /** A board shared with them: their record on it, and on their list, goes. */
  leave(id: string): Promise<void>;
  /**
   * Marks their own boards as being deleted by this page ('started', see RemoteDoc.deleting in
   * sync.ts): from then on the online rules let none of their other pages save boards, versions or
   * shares. Already marked done (only the sign-in failed to go before), it stays so.
   */
  markDeleting(): Promise<void>;
  /** Takes that mark off again (deleting failed before their boards went), keeping the boards. */
  unmarkDeleting(): void;
  /** Replaces their boards with the marker that it is done: nothing can ever be saved there again. */
  markDeleted(): Promise<void>;
  /** Their version history and list of shares (the marker stays). */
  deleteOwnData(): Promise<void>;
  /** The sign-in itself. */
  deleteUser(): Promise<void>;
}

/**
 * Deletes everything person `uid` has online (owner decisions, 2026-10-16 and 2026-10-22): their own
 * boards are first marked as being deleted, which the online rules hold their other pages to (review
 * 137-A H5: a page that saw a shared board go saved its boards and a version again after they were
 * deleted), then their shares are listed, the boards they shared (for everyone) and their records on
 * boards shared with them go, their boards are replaced by the marker that it is done, their version history and list of
 * shares go, and only then the sign-in, so a failure part-way leaves them able to sign in and try again.
 * Stops at the first failure: rejects with Firebase's `code` and `partial`, whether something may
 * already be deleted (a step that worked, or one made of several saves). Resolves with the shares it
 * dealt with, for clearing the device.
 */
export async function deleteAccountData(uid: string, backend: AccountBackend): Promise<{ shareIds: string[] }> {
  let partial = false;
  const step = async (run: () => Promise<void>, severalSaves = false) => {
    try {
      await run();
      partial = true;
    } catch (e) {
      throw Object.assign(new Error('Deleting the account stopped', { cause: e }), { code: (e as { code?: string })?.code, partial: partial || severalSaves });
    }
  };
  // Marked first, so no page of theirs saves or joins a share after they are listed.
  await step(() => backend.markDeleting());
  // Not "part-way": until the boards are marked done, a failure takes the mark off (below).
  partial = false;
  let shares: ShareOwner[] = [];
  try {
    await step(async () => {
      shares = await backend.myShares();
    });
    partial = false;
    const plan = planShares(uid, shares);
    for (const id of plan.deleteForEveryone) await step(() => backend.deleteShare(id));
    for (const id of plan.leave) await step(() => backend.leave(id));
  } catch (e) {
    // Their pages carry on syncing and saving versions (a shared board already gone is kept there
    // first). Sent, not waited for: offline it goes once the connection is back, before anything
    // this page saves after it.
    backend.unmarkDeleting();
    throw e;
  }
  // Before the version history goes, so a version another page saved just before is deleted too.
  await step(() => backend.markDeleted());
  await step(() => backend.deleteOwnData(), true);
  await step(() => backend.deleteUser());
  return { shareIds: shares.map((s) => s.id) };
}

/**
 * The keys in this device's storage (`keys`, all of them) that hold person `uid`'s data once their
 * account is deleted: the boards, which board is open and where it was looked at, version history
 * kept on the device, copies kept of a save that couldn't be read (job #160), their list of shares (`kept`: its saved text) and each share's last agreed
 * version, their own-boards list, the note of changes held back (181-A H1), and their boards kept aside (job #145; which account the device's boards belong to stays, so they are never taken for the next account's). Never another account's, nor this device's settings (dark
 * mode, text size, the tour, the focus timer, the calendar's width). The Google Calendar access kept
 * on the device (job 107) goes too: it isn't a setting (one per device, so a demo person's has no prefix).
 * `prefix`: a demo person's keys start with it.
 */
export function accountKeys(keys: string[], uid: string, shareIds: string[], kept: string | null, prefix = ''): string[] {
  const keptIds = listedShares(kept);
  const exact = new Set([BOARD_KEY, OPEN_BOARD_KEY, VIEW_KEY, LIST_KEY, parkedKey(uid), parkedBasesKey(uid), heldKey(uid), sharesKey(uid), ownBoardsKey(uid), commentsSeenKey(uid), ...[...shareIds, ...keptIds].map(baseKey)]);
  return keys.filter((key) => {
    if (key === ACCESS_KEY) return true;
    if (!key.startsWith(prefix)) return false;
    const k = key.slice(prefix.length);
    return exact.has(k) || k.startsWith(dataKey('')) || k.startsWith(UNREADABLE_KEY);
  });
}
