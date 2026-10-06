import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POMODORO_KEY, timeLeft } from '../model/pomodoro';
import { createPomodoro } from './pomodoro';
import { createStore } from './store';

const MIN = 60_000;

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}

describe('the side panel', () => {
  it('takes the right-hand spot from Version history and Due, and they take it back: one at a time', () => {
    const s = createStore(null);
    const open = () => {
      const { sidePanel, historyOpen, dueOpen } = s.getState().ui;
      return { sidePanel, historyOpen, dueOpen };
    };
    s.toggleSidePanel('pomodoro');
    expect(open()).toEqual({ sidePanel: 'pomodoro', historyOpen: false, dueOpen: false });
    s.toggleHistory();
    expect(open()).toEqual({ sidePanel: null, historyOpen: true, dueOpen: false });
    s.toggleSidePanel('pomodoro');
    expect(open()).toEqual({ sidePanel: 'pomodoro', historyOpen: false, dueOpen: false });
    s.toggleDuePanel();
    expect(open()).toEqual({ sidePanel: null, historyOpen: false, dueOpen: true });
    s.toggleSidePanel('pomodoro');
    s.toggleSidePanel('pomodoro');
    expect(open()).toEqual({ sidePanel: null, historyOpen: false, dueOpen: false });
  });
});

describe('the focus timer on this device', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it('saves the end time when started, under its own key', () => {
    const storage = memory();
    const t = createPomodoro(storage);
    t.start();
    expect(JSON.parse(storage.data[POMODORO_KEY]).timer.endsAt).toBe(1_000_000 + 25 * MIN);
  });

  it('when a round ends it moves on to the break and says so once', () => {
    const onRoundEnd = vi.fn();
    const t = createPomodoro(memory(), { onRoundEnd });
    const seen = vi.fn();
    t.subscribe(seen);
    t.start();
    vi.advanceTimersByTime(25 * MIN - 1);
    expect(onRoundEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onRoundEnd).toHaveBeenCalledTimes(1);
    expect(onRoundEnd).toHaveBeenCalledWith('focus', expect.objectContaining({ timer: expect.objectContaining({ phase: 'short' }) }));
    expect(t.get().timer.phase).toBe('short');
    expect(seen).toHaveBeenCalled();
  });

  it('pausing or resetting stops the round from ending', () => {
    const onRoundEnd = vi.fn();
    const t = createPomodoro(memory(), { onRoundEnd });
    t.start();
    t.pause();
    vi.advanceTimersByTime(60 * MIN);
    t.start();
    t.reset();
    vi.advanceTimersByTime(60 * MIN);
    expect(onRoundEnd).not.toHaveBeenCalled();
  });

  it('keeps running across a reload: a new page picks up the saved end time', () => {
    const storage = memory();
    createPomodoro(storage).start();
    vi.advanceTimersByTime(10 * MIN);
    const onRoundEnd = vi.fn();
    const again = createPomodoro(memory(storage.data), { onRoundEnd }); // the old page is gone: a copy of what it saved
    expect(timeLeft(again.get(), Date.now())).toBe(15 * MIN);
    vi.advanceTimersByTime(15 * MIN);
    expect(onRoundEnd).toHaveBeenCalledTimes(1);
  });

  it('a round that ended while the page was closed has moved on when it opens, without a chime', () => {
    const storage = memory();
    createPomodoro(storage).start();
    vi.setSystemTime(Date.now() + 40 * MIN);
    const onRoundEnd = vi.fn();
    const again = createPomodoro(storage, { onRoundEnd });
    expect(again.get().timer.phase).toBe('short');
    expect(onRoundEnd).not.toHaveBeenCalled();
  });

  it('asks to show notifications on the first Start only', () => {
    const storage = memory();
    const askToNotify = vi.fn();
    const t = createPomodoro(storage, { askToNotify });
    t.start();
    t.pause();
    t.start();
    createPomodoro(storage, { askToNotify }).start();
    expect(askToNotify).toHaveBeenCalledTimes(1);
  });

  it('remembers the lengths and the mute switch', () => {
    const storage = memory();
    const t = createPomodoro(storage);
    t.setLength('focus', 40);
    t.setMuted(true);
    expect(createPomodoro(storage).get().settings).toEqual({ focus: 40, short: 5, long: 15, muted: true });
  });

  it('a saved round longer than any allowed length (the clock was wrong) starts again stopped', () => {
    const storage = memory();
    createPomodoro(storage).start();
    vi.setSystemTime(Date.now() - 365 * 24 * 60 * MIN); // the clock is put back a year
    const again = createPomodoro(storage, { onRoundEnd: vi.fn() });
    expect(again.get().timer).toEqual({ phase: 'focus', round: 1, endsAt: null, left: null });
  });

  it('follows changes made in another tab, and only one tab chimes for a round', () => {
    const storage = memory();
    const ends = vi.fn();
    const a = createPomodoro(storage, { onRoundEnd: ends });
    const b = createPomodoro(storage, { onRoundEnd: ends });
    a.start();
    b.reload(); // the browser tells tab B that the saved timer changed
    expect(b.get().timer.endsAt).toBe(a.get().timer.endsAt);
    b.setLength('short', 7); // doesn't stop tab A's round
    a.reload();
    expect(a.get().timer.endsAt).not.toBeNull();
    vi.advanceTimersByTime(25 * MIN);
    expect(a.get().timer.phase).toBe('short');
    expect(b.get().timer.phase).toBe('short');
    expect(ends).toHaveBeenCalledTimes(1); // the second tab finds it already done
  });

  it('works without storage', () => {
    const t = createPomodoro(null);
    t.start();
    expect(t.get().timer.endsAt).not.toBeNull();
  });
});
