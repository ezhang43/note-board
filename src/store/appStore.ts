import { useSyncExternalStore } from 'react';
import { collab } from '../sync/collabSession';
import { demoStorage, demoUser } from '../sync/demo';
import { createStore, type AppState } from './store';
import { POMODORO_KEY, type Phase } from '../model/pomodoro';
import { askToNotify, chime, notifyIfHidden } from './env';
import { viewOnly } from '../model/sharing';
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
// The save on this device couldn't be read: say what happened to it (job #160).
if (appStore.startNote) collab.setNotice(appStore.startNote);

/**
 * Puts the light / dark choice and the color theme on the page (<html data-theme data-color-theme>), so the stylesheet can switch
 * colours everywhere, the sign-in screen included; also tints the browser / app title bar.
 */
function showTheme() {
  const { theme, colorTheme } = appStore.getState().view;
  const root = document.documentElement;
  if (root.dataset.theme === theme && root.dataset.colorTheme === colorTheme) return;
  root.dataset.theme = theme;
  root.dataset.colorTheme = colorTheme;
  // The title bar takes the toolbar's color, read from the stylesheet so it is defined once.
  const bar = getComputedStyle(root).getPropertyValue('--toolbar-bg').trim().toUpperCase() || (theme === 'dark' ? '#24221E' : '#FFFDF8'); // the old colors if the stylesheet isn't in yet
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar);
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

/** Whether the open board is shared with this person to view or comment on only (job 161): nothing on it can be changed. */
export const useViewOnly = () => useAppState((s) => viewOnly(s.ui.shares, s.boards.open));

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
