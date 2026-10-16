import { useSyncExternalStore } from 'react';
import { parseWorkspace } from '../model/workspace';
import { accountKeys } from '../store/account';
import { sharesKey } from '../store/sharing';
import type { Store } from '../store/store';

// Delete your account and data (job #63, required by Google Play). The published site (session.ts)
// and a demo person (demo.ts) say how; running locally without one there is no account, so the
// File menu doesn't offer it.

let remover: (() => Promise<void>) | null = null;
let panelOpen = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export const account = {
  /**
   * Confirms the sign-in with Google, deletes everything online, clears this device and reloads to
   * the sign-in screen. Rejects if it didn't work (with Firebase's `code`, if any). Null where
   * there is no account.
   */
  remover: () => remover,
  setRemover(fn: (() => Promise<void>) | null) {
    remover = fn;
    changed();
  },
  isOpen: () => panelOpen,
  open() {
    panelOpen = true;
    changed();
  },
  close() {
    panelOpen = false;
    changed();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const useAccountRemover = () => useSyncExternalStore(account.subscribe, account.remover);
export const useAccountPanel = () => useSyncExternalStore(account.subscribe, account.isOpen);

/** Set just before the page reloads after deleting, so the sign-in screen can say so (once). */
const DELETED_KEY = 'note-board:account-deleted';

/**
 * Once everything online is deleted: clears person `uid`'s data from this device (see accountKeys;
 * `shareIds`: the shares just dealt with, `prefix`: a demo person's keys) and reloads, so nothing
 * of theirs stays in memory either. The board on screen is emptied first, so a save still waiting
 * can't write their boards back.
 */
export function finishDeletion(store: Store, storage: Storage, uid: string, shareIds: string[], prefix = '') {
  store.replaceWorkspace(parseWorkspace(null));
  store.flush();
  try {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i) ?? '');
    for (const key of accountKeys(keys, uid, shareIds, storage.getItem(prefix + sharesKey(uid)), prefix)) storage.removeItem(key);
    sessionStorage.setItem(DELETED_KEY, '1');
  } catch {
    // Storage blocked: there is nothing kept on the device to clear.
  }
  location.reload();
}

/** Whether this page opened just after deleting an account (read once, at the start). */
export function takeDeletedNote(): boolean {
  try {
    const deleted = sessionStorage.getItem(DELETED_KEY) === '1';
    sessionStorage.removeItem(DELETED_KEY);
    return deleted;
  } catch {
    return false;
  }
}
