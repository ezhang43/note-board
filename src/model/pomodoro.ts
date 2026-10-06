// Focus timer (Pomodoro), owner request 2026-10-06: 25 minutes of focus, a 5-minute break, and a
// 15-minute long break after every 4 focus rounds. A per-device setting, like the light / dark
// choice: not board data, not undoable, not synced. A running round is kept as the time it ends
// (not a ticking counter), so the time left is right after a reload or a sleeping computer.

export type Phase = 'focus' | 'short' | 'long';

export interface PomodoroSettings {
  /** Lengths in whole minutes. */
  focus: number;
  short: number;
  long: number;
  /** No chime when a round ends. */
  muted: boolean;
}

export interface PomodoroTimer {
  phase: Phase;
  /** Which focus round of the 4 this is (a break keeps the number of the round before it). */
  round: number;
  /** Running: when the round ends (ms since 1970). */
  endsAt: number | null;
  /** Paused: the time left (ms). Neither set: stopped at the round's full length. */
  left: number | null;
}

export interface Pomodoro {
  settings: PomodoroSettings;
  timer: PomodoroTimer;
  /** Notifications were asked for already (on the first Start). */
  asked: boolean;
}

/** Where this device keeps the timer and its settings. */
export const POMODORO_KEY = 'note-board:pomodoro';
/** Focus rounds before a long break. */
export const ROUNDS = 4;
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 120;

const MINUTE = 60_000;

export const DEFAULT_POMODORO: Pomodoro = {
  settings: { focus: 25, short: 5, long: 15, muted: false },
  timer: { phase: 'focus', round: 1, endsAt: null, left: null },
  asked: false,
};

export const isRunning = (p: Pomodoro) => p.timer.endsAt !== null;

/** The full length of the current round (ms). */
const fullLength = (p: Pomodoro) => p.settings[p.timer.phase] * MINUTE;

/** Time left in the current round (ms), never below 0. */
export function timeLeft(p: Pomodoro, now: number): number {
  const { endsAt, left } = p.timer;
  if (endsAt !== null) return Math.max(0, endsAt - now);
  return left ?? fullLength(p);
}

/** Whether the running round has run out by `now`. */
export const roundEnded = (p: Pomodoro, now: number) => p.timer.endsAt !== null && now >= p.timer.endsAt;

const withTimer = (p: Pomodoro, timer: Partial<PomodoroTimer>): Pomodoro => ({ ...p, timer: { ...p.timer, ...timer } });

export function start(p: Pomodoro, now: number): Pomodoro {
  if (isRunning(p)) return p;
  return withTimer(p, { endsAt: now + timeLeft(p, now), left: null });
}

export function pause(p: Pomodoro, now: number): Pomodoro {
  if (!isRunning(p)) return p;
  return withTimer(p, { endsAt: null, left: timeLeft(p, now) });
}

/** Stops the round and puts it back to its full length (the round number stays). */
export const reset = (p: Pomodoro): Pomodoro => withTimer(p, { endsAt: null, left: null });

/** Moves on to the next round, stopped at its full length: after a round ends, or on Skip. */
export function skip(p: Pomodoro): Pomodoro {
  const { phase, round } = p.timer;
  const next: Pick<PomodoroTimer, 'phase' | 'round'> =
    phase === 'focus' ? { phase: round >= ROUNDS ? 'long' : 'short', round } : { phase: 'focus', round: phase === 'long' ? 1 : round + 1 };
  return withTimer(p, { ...next, endsAt: null, left: null });
}

const goodMinutes = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= MIN_MINUTES && (n as number) <= MAX_MINUTES;

/** A new length for focus or a break, in whole minutes; anything else changes nothing. */
export function setLength(p: Pomodoro, which: Phase, minutes: number): Pomodoro {
  if (!goodMinutes(minutes)) return p;
  return { ...p, settings: { ...p.settings, [which]: minutes } };
}

/** "18:42": minutes and seconds left, part-seconds rounded up (so 0:00 shows only at the end). */
export function formatTime(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const timeOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);

/** What this device saved; a missing or bad value falls back to its default. */
export function readPomodoro(text: string | null): Pomodoro {
  let data: unknown;
  try {
    data = JSON.parse(text ?? '');
  } catch {
    return DEFAULT_POMODORO;
  }
  if (!isObject(data)) return DEFAULT_POMODORO;
  const s = isObject(data.settings) ? data.settings : {};
  const d = DEFAULT_POMODORO.settings;
  const settings: PomodoroSettings = {
    focus: goodMinutes(s.focus) ? s.focus : d.focus,
    short: goodMinutes(s.short) ? s.short : d.short,
    long: goodMinutes(s.long) ? s.long : d.long,
    muted: typeof s.muted === 'boolean' ? s.muted : d.muted,
  };
  const t = isObject(data.timer) ? data.timer : {};
  const good =
    (t.phase === 'focus' || t.phase === 'short' || t.phase === 'long') &&
    Number.isInteger(t.round) &&
    (t.round as number) >= 1 &&
    (t.round as number) <= ROUNDS &&
    timeOrNull(t.endsAt) &&
    timeOrNull(t.left);
  const timer = good ? ({ phase: t.phase, round: t.round, endsAt: t.endsAt, left: t.left } as PomodoroTimer) : DEFAULT_POMODORO.timer;
  return { settings, timer, asked: data.asked === true };
}
