import { useSyncExternalStore } from 'react';
import { VIZ_AI_AUTO_KEY, VIZ_CALM_KEY, VIZ_GROUP_KEY, parseAutoSort, parseCalm, parseGroupBy, type VizGroupBy } from '../model/visualizer';

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

/** The Calm button's choice saved on this device. Unreadable or blocked storage means off. */
export function readCalm(): boolean {
  try {
    return parseCalm(localStorage.getItem(VIZ_CALM_KEY));
  } catch {
    return false;
  }
}

/** Sort with AI's "Sort automatically" box saved on this device. Unreadable or blocked storage means on. */
export function readAutoSort(): boolean {
  try {
    return parseAutoSort(localStorage.getItem(VIZ_AI_AUTO_KEY));
  } catch {
    return parseAutoSort(null);
  }
}

export function saveAutoSort(on: boolean) {
  try {
    localStorage.setItem(VIZ_AI_AUTO_KEY, on ? '1' : '0');
  } catch {
    // not kept: it is only a convenience
  }
}

export function saveCalm(on: boolean) {
  try {
    localStorage.setItem(VIZ_CALM_KEY, on ? '1' : '0');
  } catch {
    // not kept: it is only a convenience
  }
}
