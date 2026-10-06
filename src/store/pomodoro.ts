import { useSyncExternalStore } from 'react';
import type { StorageLike } from '../model/persist';
import * as model from '../model/pomodoro';
import { POMODORO_KEY, readPomodoro, type Phase, type Pomodoro } from '../model/pomodoro';

// The focus timer on this device (owner request, 2026-10-06). Kept apart from the board store:
// it is a per-device setting, not board data, so it is never undone, synced or saved with a board.

export interface PomodoroHooks {
  /** A running round ran out: `ended` is the round that ended, `next` the timer now. */
  onRoundEnd?: (ended: Phase, next: Pomodoro) => void;
  /** The first Start on this device: ask to show notifications. */
  askToNotify?: () => void;
}

export function createPomodoro(storage: StorageLike | null, hooks: PomodoroHooks = {}) {
  let state = readPomodoro(safe(() => storage?.getItem(POMODORO_KEY) ?? null));
  const listeners = new Set<() => void>();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  // A round that ran out while the page was closed has simply moved on (no chime for it now).
  if (model.roundEnded(state, Date.now())) state = model.skip(state);

  function set(next: Pomodoro) {
    if (next === state) return;
    state = next;
    safe(() => storage?.setItem(POMODORO_KEY, JSON.stringify(state)));
    schedule();
    listeners.forEach((l) => l());
  }

  // One timeout to the end of a running round (a single long timeout isn't slowed down in a
  // background tab the way a repeating one is).
  function schedule() {
    clearTimeout(timeout);
    const { endsAt } = state.timer;
    if (endsAt === null) return;
    timeout = setTimeout(() => {
      if (!model.roundEnded(state, Date.now())) return schedule();
      const ended = state.timer.phase;
      set(model.skip(state));
      hooks.onRoundEnd?.(ended, state);
    }, Math.max(0, endsAt - Date.now()));
  }
  schedule();

  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    start() {
      if (!state.asked) {
        hooks.askToNotify?.();
        set({ ...state, asked: true });
      }
      set(model.start(state, Date.now()));
    },
    pause: () => set(model.pause(state, Date.now())),
    reset: () => set(model.reset(state)),
    skip: () => set(model.skip(state)),
    setLength: (which: Phase, minutes: number) => set(model.setLength(state, which, minutes)),
    setMuted: (muted: boolean) => set({ ...state, settings: { ...state.settings, muted } }),
  };
}

export type PomodoroStore = ReturnType<typeof createPomodoro>;

/** Read the focus timer in a component; re-renders when it changes. */
export function usePomodoro(store: PomodoroStore): Pomodoro {
  return useSyncExternalStore(store.subscribe, store.get);
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null; // storage switched off or full: the timer still works on this page
  }
}
