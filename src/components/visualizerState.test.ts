import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAutoSort, saveAutoSort } from './visualizerState';

// Sort automatically decides whether item texts go to Anthropic without a press (job "viz-ai-autosort"), so an
// untick must hold for the rest of the visit even where this browser refuses to store it.

afterEach(() => vi.unstubAllGlobals());

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
