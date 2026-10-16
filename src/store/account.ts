import { planShares, type ShareOwner } from '../model/account';
import { BOARD_KEY, VIEW_KEY } from '../model/persist';
import { OPEN_BOARD_KEY } from '../model/workspace';
import { baseKey, ownBoardsKey, sharesKey } from './sharing';
import { dataKey, LIST_KEY } from './versions';

// Deleting your account and data (job #63, required by Google Play). Firestore on the published
// site (src/sync/firebase.ts), the pretend sharing server for demo people (src/sync/demo.ts).

/** Where a person's account lives online. Every call is fine to make again after it worked. */
export interface AccountBackend {
  /** Every share on this person's list, with who shared it (null: gone or no longer readable). */
  myShares(): Promise<ShareOwner[]>;
  /** A board they shared: deleted for everyone, with its records of who has it. */
  deleteShare(id: string): Promise<void>;
  /** A board shared with them: their record on it, and on their list, goes. */
  leave(id: string): Promise<void>;
  /** Their own boards, version history and list of shares. */
  deleteOwnData(): Promise<void>;
  /** The sign-in itself. */
  deleteUser(): Promise<void>;
}

/**
 * Deletes everything person `uid` has online (owner decision, 2026-10-16): the boards they shared
 * (for everyone), their records on boards shared with them, their own boards and version history,
 * and only then the sign-in, so a failure part-way leaves them able to sign in and try again.
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
  let shares: ShareOwner[] = [];
  await step(async () => {
    shares = await backend.myShares();
  });
  partial = false;
  const plan = planShares(uid, shares);
  for (const id of plan.deleteForEveryone) await step(() => backend.deleteShare(id));
  for (const id of plan.leave) await step(() => backend.leave(id));
  await step(() => backend.deleteOwnData(), true);
  await step(() => backend.deleteUser());
  return { shareIds: shares.map((s) => s.id) };
}

/**
 * The keys in this device's storage (`keys`, all of them) that hold person `uid`'s data once their
 * account is deleted: the boards, which board is open and where it was looked at, version history
 * kept on the device, their list of shares (`kept`: its saved text) and each share's last agreed
 * version, and their own-boards list. Never another account's, nor this device's settings (dark
 * mode, text size, the tour, the focus timer, the calendar's width). `prefix`: a demo person's keys
 * start with it.
 */
export function accountKeys(keys: string[], uid: string, shareIds: string[], kept: string | null, prefix = ''): string[] {
  let keptIds: string[] = [];
  try {
    const list = JSON.parse(kept ?? 'null') as unknown;
    if (Array.isArray(list)) keptIds = list.map((x) => (x as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string');
  } catch {
    // A damaged list: only the shares from the server count.
  }
  const exact = new Set([BOARD_KEY, OPEN_BOARD_KEY, VIEW_KEY, LIST_KEY, sharesKey(uid), ownBoardsKey(uid), ...[...shareIds, ...keptIds].map(baseKey)]);
  return keys.filter((key) => {
    if (!key.startsWith(prefix)) return false;
    const k = key.slice(prefix.length);
    return exact.has(k) || k.startsWith(dataKey(''));
  });
}
