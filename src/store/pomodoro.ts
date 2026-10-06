import { useSyncExternalStore } from 'react';
import type { StorageLike } from '../model/persist';
import * as model from '../model/pomodoro';
import { DEFAULT_POMODORO, MAX_MINUTES, POMODORO_KEY, readPomodoro, type Phase, type Pomodoro } from '../model/pomodoro';

// The focus timer on this device (owner request, 2026-10-06). Kept apart from the board store:
// it is a per-device setting, not board data, so it is never undone, synced or saved with a board.

export interface PomodoroHooks {
  /** A running round ran out: `ended` is the round that ended, `next` the timer now. */
  onRoundEnd?: (ended: Phase, next: Pomodoro) => void;
  /** The first Start on this device: ask to show notifications. */
  askToNotify?: () => void;
}

/** Longest a round can have left: anything more means the computer's clock was wrong. */
const LONGEST = MAX_MINUTES * 60_000;

export function createPomodoro(storage: StorageLike | null, hooks: PomodoroHooks = {}) {
  /** What is saved on this device (another tab may have changed it), made safe to use now. */
  function saved(): Pomodoro {
    let p = readPomodoro(safe(() => storage?.getItem(POMODORO_KEY) ?? null));
    const now = Date.now();
    if (model.timeLeft(p, now) > LONGEST) p = { ...p, timer: DEFAULT_POMODORO.timer };
    // A round that ran out while the page was closed has simply moved on (no chime for it now).
    return model.roundEnded(p, now) ? model.skip(p) : p;
  }

  let state = saved();
  const listeners = new Set<() => void>();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function show(next: Pomodoro) {
    state = next;
    schedule();
    listeners.forEach((l) => l());
  }

  function set(next: Pomodoro) {
    if (next === state) return;
    safe(() => storage?.setItem(POMODORO_KEY, JSON.stringify(next)));
    show(next);
  }

  // One timeout to the end of a running round (a single long timeout isn't slowed down in a
  // background tab the way a repeating one is).
  function schedule() {
    clearTimeout(timeout);
    const { endsAt } = state.timer;
    if (endsAt === null) return;
    timeout = setTimeout(roundEnd, Math.min(LONGEST, Math.max(0, endsAt - Date.now())));
  }

  function roundEnd() {
    if (!model.roundEnded(state, Date.now())) return schedule();
    // Another tab may have ended this round already: then just show what it saved, without a chime.
    // simple: two tabs ending it at the very same moment may both chime.
    const stored = readPomodoro(safe(() => storage?.getItem(POMODORO_KEY) ?? null));
    if (storage && stored.timer.endsAt !== state.timer.endsAt) return show(saved());
    const ended = state.timer.phase;
    set(model.skip(state));
    hooks.onRoundEnd?.(ended, state);
  }
  schedule();

  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Another tab changed the saved timer: show that. */
    reload: () => show(saved()),
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
