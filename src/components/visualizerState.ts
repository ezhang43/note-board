import { useSyncExternalStore } from 'react';
import { VIZ_GROUP_KEY, parseGroupBy, type VizGroupBy } from '../model/visualizer';

// Whether the Visualizer is open (owner request 2026-11-12). It is view state only: never saved, never
// undone, and kept out of the board store so opening it can't touch the saved boards (SPEC "Visualizer").

let open = false;
const listeners = new Set<() => void>();
const set = (to: boolean) => {
  if (open === to) return;
  open = to;
  listeners.forEach((l) => l());
};

export const openVisualizer = () => set(true);
export const closeVisualizer = () => set(false);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useVisualizerOpen = () => useSyncExternalStore(subscribe, () => open);

/** The By category / By board choice saved on this device. Storage can be missing or blocked (a private window, cleared site data): then it is By category and nothing is kept. */
export function readGroupBy(): VizGroupBy {
  try {
    return parseGroupBy(localStorage.getItem(VIZ_GROUP_KEY));
  } catch {
    return parseGroupBy(null);
  }
}

export function saveGroupBy(by: VizGroupBy) {
  try {
    localStorage.setItem(VIZ_GROUP_KEY, by);
  } catch {
    // not kept: it is only a convenience
  }
}
