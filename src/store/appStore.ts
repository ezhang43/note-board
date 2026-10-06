import { useSyncExternalStore } from 'react';
import { demoStorage, demoUser } from '../sync/demo';
import { createStore, type AppState } from './store';
import { POMODORO_KEY, type Phase } from '../model/pomodoro';
import { askToNotify, chime, notifyIfHidden } from './env';
import { createPomodoro } from './pomodoro';

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

const ROUND_NAME: Record<Phase, string> = { focus: 'focus round', short: 'short break', long: 'long break' };

/**
 * The focus timer on this device (owner request, 2026-10-06). Kept in the browser's own storage,
 * not the board's: never synced, and the same for every demo person.
 */
export const pomodoro = createPomodoro(
  (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })(),
  {
    askToNotify,
    onRoundEnd(ended, next) {
      if (!next.settings.muted) chime();
      const { phase } = next.timer;
      notifyIfHidden(ended === 'focus' ? 'Focus round done' : 'Break over', `Next: a ${next.settings[phase]}-minute ${ROUND_NAME[phase]}.`);
    },
  },
);
// With the board open in two tabs, each follows what the other does with the timer.
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => e.key === POMODORO_KEY && pomodoro.reload());
