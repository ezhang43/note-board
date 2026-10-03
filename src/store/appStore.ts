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

/**
 * Puts the light / dark choice on the page (<html data-theme>), so the stylesheet can switch
 * colours everywhere, the sign-in screen included; also tints the browser / app title bar.
 */
function showTheme() {
  const theme = appStore.getState().view.theme;
  if (document.documentElement.dataset.theme === theme) return;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#232220' : '#FFFFFF');
}
if (typeof document !== 'undefined') {
  showTheme();
  appStore.subscribe(showTheme);
}

/** Read part of the app state in a component; re-renders when that part changes. */
export function useAppState<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(appStore.subscribe, () => select(appStore.getState()));
}
