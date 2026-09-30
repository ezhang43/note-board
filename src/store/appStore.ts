import { useSyncExternalStore } from 'react';
import { createStore, type AppState } from './store';

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The one store the app uses. */
export const appStore = createStore(browserStorage());

/** Read part of the app state in a component; re-renders when that part changes. */
export function useAppState<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(appStore.subscribe, () => select(appStore.getState()));
}
