import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeVisualizer, closeWhenGone, openVisualizer, readAutoSort, saveAutoSort, visualizerIsOpen } from './visualizerState';

// Sort automatically decides whether item texts go to Anthropic without a press (job "viz-ai-autosort"), so an
// untick must hold for the rest of the visit even where this browser refuses to store it.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  closeVisualizer();
});

describe('Sort automatically when storage is blocked', () => {
  it('an untick is kept for this visit, though it cannot be saved', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    vi.stubGlobal('localStorage', blocked);
    expect(readAutoSort()).toBe(true);
    saveAutoSort(false);
    expect(readAutoSort()).toBe(false);
    saveAutoSort(true);
    expect(readAutoSort()).toBe(true);
  });

  it('a save that fails while reading works (storage full) does not bring back the older saved choice', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '1',
      setItem: () => {
        throw new Error('full');
      },
    });
    saveAutoSort(false);
    expect(readAutoSort()).toBe(false);
  });

  it('with working storage, the saved choice is read', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    saveAutoSort(false);
    expect(readAutoSort()).toBe(false);
    saveAutoSort(true);
    expect(readAutoSort()).toBe(true);
  });
});

// The open flag lives outside React, so it outlived a sign-out: the board went away, and signing in again in the
// same tab reopened the Visualizer by itself (review 2026-11-15, item 10). closeWhenGone is the effect of the
// always-present Visualizer component: when the board goes away, it closes. React's development double-run
// (mount, unmount, mount at once) must not close it.
describe('the Visualizer after the board goes away', () => {
  it('is closed once the board is gone, so signing in again does not reopen it', () => {
    vi.useFakeTimers();
    const gone = closeWhenGone();
    openVisualizer();
    gone();
    vi.runAllTimers();
    expect(visualizerIsOpen()).toBe(false);
  });

  it('stays open through the mount, unmount, mount check React makes in development', () => {
    vi.useFakeTimers();
    openVisualizer();
    const first = closeWhenGone();
    first();
    const second = closeWhenGone();
    vi.runAllTimers();
    expect(visualizerIsOpen()).toBe(true);
    second();
  });
});
