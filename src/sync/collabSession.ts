import { useSyncExternalStore } from 'react';
import { parseJoin } from '../model/sharing';
import type { Person } from '../store/collab';
import type { Sharing } from '../store/sharing';
import type { Store } from '../store/store';

// The sharing this page uses once someone is signed in (the published site, or `npm run dev` with
// ?demo-user=), for the screen to reach: the Share panel, the Boards menu, notices.

let sharing: Sharing | null = null;
let me: Person | null = null;
let notice: string | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export const collab = {
  /** Null where nothing can be shared (running locally without a demo person). */
  sharing: () => sharing,
  me: () => me,
  set(next: Sharing | null, person: Person | null) {
    sharing = next;
    me = person;
    changed();
  },
  notice: () => notice,
  setNotice(text: string | null) {
    notice = text;
    changed();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** The sharing in use, re-rendering when it starts or stops. */
export function useSharing() {
  return useSyncExternalStore(collab.subscribe, collab.sharing);
}

export function useNotice() {
  return useSyncExternalStore(collab.subscribe, collab.notice);
}

/**
 * Opened from a share link (?join=…): join that share and open its board. The link is taken out of
 * the address first, so a reload doesn't join again.
 */
export function joinFromAddress(store: Store, active: Sharing) {
  const join = parseJoin(location.search);
  if (!join) return;
  const url = new URL(location.href);
  url.searchParams.delete('join');
  history.replaceState(history.state, '', url.href);
  active.join(join.id, join.key).then(
    (root) => store.openBoard(root),
    () => collab.setNotice('This share link doesn’t work. It may have been turned off: ask for a new one.'),
  );
}
