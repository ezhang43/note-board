import { useSyncExternalStore } from 'react';
import { demoStorage, demoUser } from '../sync/demo';
import { createStore, type AppState } from './store';

function browserStorage() {
  try {
    // Running locally with ?demo-user=: each demo person keeps their own boards on this device.
    const demo = demoUser();
    return demo ? demoStorage(window.localStorage, demo) : window.localStorage;
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#2A2416' : '#FFF1C2');
}
if (typeof document !== 'undefined') {
  showTheme();
  appStore.subscribe(showTheme);
}

/**
 * The state as the screen shows it: while an old version is being looked at (version history),
 * its board stands in for the real one, which is left untouched.
 */
let shownFor: AppState | null = null;
let shown: AppState | null = null;
function shownState(): AppState {
  const s = appStore.getState();
  if (!s.ui.preview) return s;
  if (shownFor !== s) {
    shownFor = s;
    shown = { ...s, board: s.ui.preview.board };
  }
  return shown!;
}

/** Read part of the app state in a component; re-renders when that part changes. */
export function useAppState<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(appStore.subscribe, () => select(shownState()));
}
