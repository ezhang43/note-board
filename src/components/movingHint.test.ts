// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { markMoving, SETTLE_MS } from './movingHint';

// Job perf-pan-layer: the board layer is marked while a pan or zoom gesture moves it, and the mark always comes
// off SETTLE_MS after the last step, whatever kind of gesture it was and however it ended (or failed to end).

let world: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  world = document.createElement('div');
});
afterEach(() => vi.useRealTimers());

it('marks the layer at once and clears it a moment after the last step', () => {
  markMoving(world);
  expect(world.classList.contains('moving')).toBe(true);
  vi.advanceTimersByTime(SETTLE_MS - 1);
  expect(world.classList.contains('moving')).toBe(true);
  vi.advanceTimersByTime(1);
  expect(world.classList.contains('moving')).toBe(false);
});

it('keeps it on while steps keep coming, timed from the last one', () => {
  for (let i = 0; i < 10; i++) {
    markMoving(world);
    vi.advanceTimersByTime(SETTLE_MS / 2);
  }
  expect(world.classList.contains('moving')).toBe(true);
  vi.advanceTimersByTime(SETTLE_MS);
  expect(world.classList.contains('moving')).toBe(false);
});

it('a gesture whose end never arrives (a lost finger, an unmount) still clears: nothing waits for an end', () => {
  markMoving(world); // a drag or pinch step, then no pointerup
  vi.advanceTimersByTime(SETTLE_MS);
  expect(world.classList.contains('moving')).toBe(false);
  markMoving(world); // a later wheel turn
  vi.advanceTimersByTime(SETTLE_MS);
  expect(world.classList.contains('moving')).toBe(false);
});

it('two layers (a board shown again) keep their own timers', () => {
  const other = document.createElement('div');
  markMoving(world);
  vi.advanceTimersByTime(SETTLE_MS / 2);
  markMoving(other);
  vi.advanceTimersByTime(SETTLE_MS / 2);
  expect(world.classList.contains('moving')).toBe(false);
  expect(other.classList.contains('moving')).toBe(true);
});

it('does nothing without a layer', () => {
  expect(() => markMoving(null)).not.toThrow();
});
