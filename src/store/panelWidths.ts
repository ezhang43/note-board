import { useSyncExternalStore } from 'react';
import { readWidths, SIDE_DEFAULT } from '../model/calendar';
import { deviceStorage } from './env';

// How wide a side panel is, kept on this device (owner request 2026-10-16 for the calendar, 2026-10-20
// for the other panels). Not board data: never undone, synced or kept in Version history. The calendar
// (Week and Month) and the other panels each use one of these, under their own key.

type WidthStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createWidthStore<K extends string>(key: string, defaults: Record<K, number>, storage: WidthStorage | null) {
  let saved: string | null = null;
  try {
    saved = storage?.getItem(key) ?? null;
  } catch {
    // Blocked storage: the usual widths are used.
  }
  let widths = readWidths(saved, defaults);
  const listeners = new Set<() => void>();
  const store = {
    get: () => widths,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    set(k: K, width: number) {
      widths = { ...widths, [k]: width };
      listeners.forEach((l) => l());
      try {
        storage?.setItem(key, JSON.stringify(widths));
      } catch {
        // Full or blocked storage: the width still holds until the page is closed.
      }
    },
    reset: (k: K) => store.set(k, defaults[k]),
  };
  return store;
}

const SIDE_WIDTH_KEY = 'note-board:panel-widths';
/** The widths of every side panel but the calendar. */
export const panelWidths = createWidthStore(SIDE_WIDTH_KEY, SIDE_DEFAULT, deviceStorage());

export const usePanelWidths = () => useSyncExternalStore(panelWidths.subscribe, panelWidths.get);
