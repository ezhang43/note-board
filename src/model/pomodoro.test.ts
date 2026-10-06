import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POMODORO,
  formatTime,
  isRunning,
  pause,
  readPomodoro,
  reset,
  roundEnded,
  setLength,
  skip,
  start,
  timeLeft,
  type Pomodoro,
} from './pomodoro';

const MIN = 60_000;

/** Runs the timer from `p` to the end of its round and moves on, as the clock would. */
function finishRound(p: Pomodoro, now: number): [Pomodoro, number] {
  const running = start(p, now);
  const end = now + timeLeft(running, now);
  expect(roundEnded(running, end - 1)).toBe(false);
  expect(roundEnded(running, end)).toBe(true);
  return [skip(running), end];
}

describe('pomodoro timer', () => {
  it('starts as a 25-minute focus round, round 1, stopped', () => {
    const p = DEFAULT_POMODORO;
    expect(p.timer.phase).toBe('focus');
    expect(p.timer.round).toBe(1);
    expect(isRunning(p)).toBe(false);
    expect(timeLeft(p, 0)).toBe(25 * MIN);
    expect(p.settings).toEqual({ focus: 25, short: 5, long: 15, muted: false });
  });

  it('counts down from the end time, so the time left is right whenever it is looked at', () => {
    const p = start(DEFAULT_POMODORO, 1000);
    expect(p.timer.endsAt).toBe(1000 + 25 * MIN);
    expect(timeLeft(p, 1000 + 6 * MIN + 18_000)).toBe(18 * MIN + 42_000);
    expect(timeLeft(p, 1000 + 99 * MIN)).toBe(0);
  });

  it('pausing keeps the time left; starting again carries on from there', () => {
    const paused = pause(start(DEFAULT_POMODORO, 0), 10 * MIN);
    expect(isRunning(paused)).toBe(false);
    expect(timeLeft(paused, 50 * MIN)).toBe(15 * MIN);
    const again = start(paused, 50 * MIN);
    expect(timeLeft(again, 55 * MIN)).toBe(10 * MIN);
  });

  it('starting a running timer or pausing a stopped one changes nothing', () => {
    const running = start(DEFAULT_POMODORO, 0);
    expect(start(running, 5 * MIN)).toBe(running);
    expect(pause(DEFAULT_POMODORO, 5 * MIN)).toBe(DEFAULT_POMODORO);
  });

  it('reset stops the round and puts it back to its full length, keeping the round', () => {
    const [onBreak] = finishRound(DEFAULT_POMODORO, 0);
    const r = reset(start(onBreak, 0));
    expect(r.timer.phase).toBe('short');
    expect(isRunning(r)).toBe(false);
    expect(timeLeft(r, 99 * MIN)).toBe(5 * MIN);
  });

  it('goes focus, break, focus… with a long break after every 4 focus rounds', () => {
    let p = DEFAULT_POMODORO;
    let now = 0;
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      seen.push(`${p.timer.phase}${p.timer.round}`);
      [p, now] = finishRound(p, now);
    }
    expect(seen).toEqual(['focus1', 'short1', 'focus2', 'short2', 'focus3', 'short3', 'focus4', 'long4', 'focus1']);
  });

  it('a new round waits stopped at its full length', () => {
    const [p] = finishRound(DEFAULT_POMODORO, 0);
    expect(p.timer.phase).toBe('short');
    expect(isRunning(p)).toBe(false);
    expect(timeLeft(p, 0)).toBe(5 * MIN);
  });

  it('skip moves on to the next round straight away, as if it had ended', () => {
    const p = skip(start(DEFAULT_POMODORO, 0));
    expect(p.timer.phase).toBe('short');
    expect(isRunning(p)).toBe(false);
  });

  it('lengths can be changed (whole minutes, 1 to 120); a stopped round takes the new length', () => {
    let p = setLength(DEFAULT_POMODORO, 'focus', 50);
    expect(timeLeft(p, 0)).toBe(50 * MIN);
    p = setLength(p, 'long', 20);
    expect(p.settings.long).toBe(20);
    for (const bad of [0, -5, 121, 2.5, Number.NaN]) expect(setLength(p, 'short', bad)).toBe(p);
  });

  it('changing a length leaves a running round as it is', () => {
    const running = start(DEFAULT_POMODORO, 0);
    const p = setLength(running, 'focus', 10);
    expect(timeLeft(p, 5 * MIN)).toBe(20 * MIN);
  });

  it('shows the time as minutes and seconds, rounding part-seconds up', () => {
    expect(formatTime(25 * MIN)).toBe('25:00');
    expect(formatTime(18 * MIN + 41_200)).toBe('18:42');
    expect(formatTime(9_000)).toBe('00:09');
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(120 * MIN)).toBe('120:00');
  });
});

describe('reading the saved timer', () => {
  it('reads back what was saved', () => {
    const p: Pomodoro = { ...setLength(start(DEFAULT_POMODORO, 5000), 'short', 7), asked: true };
    p.settings.muted = true;
    expect(readPomodoro(JSON.stringify(p))).toEqual(p);
  });

  it('falls back to the defaults for missing or damaged data', () => {
    for (const bad of [null, '', 'not json', '42', '[]', 'null', '{"settings":"x","timer":7}']) expect(readPomodoro(bad)).toEqual(DEFAULT_POMODORO);
  });

  it('a bad length falls back to its default; the good ones are kept', () => {
    const p = readPomodoro(JSON.stringify({ settings: { focus: 'lots', short: 3, long: 999, muted: 'yes' } }));
    expect(p.settings).toEqual({ focus: 25, short: 3, long: 15, muted: false });
  });

  it('a damaged timer starts again as a stopped focus round', () => {
    for (const timer of [{ phase: 'nap', round: 1, endsAt: null, left: null }, { phase: 'short', round: 9, endsAt: null, left: null }, { phase: 'focus', round: 1, endsAt: 'soon', left: null }, { phase: 'focus', round: 1, endsAt: null, left: -4 }])
      expect(readPomodoro(JSON.stringify({ settings: DEFAULT_POMODORO.settings, timer })).timer).toEqual(DEFAULT_POMODORO.timer);
  });
});
