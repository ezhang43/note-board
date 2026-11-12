import { useSyncExternalStore } from 'react';

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
