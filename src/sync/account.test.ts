import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finishDeletion } from './account';
import type { Store } from '../store/store';

// Clearing this device once an account is deleted (job #63; the AI key, job 12b). The device's
// storages are stand-ins with `length` and `key(i)`, as finishDeletion walks every key.

function fakeStorage(entries: Record<string, string>) {
  const m = new Map(Object.entries(entries));
  return {
    map: m,
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

const store = { replaceWorkspace: vi.fn(), flush: vi.fn() } as unknown as Store;
const SECRET = 'sk-ant-api03-SECRET-abcd1234';
let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reload = vi.fn();
  vi.stubGlobal('location', { reload });
});

describe('finishDeletion', () => {
  it('clears this person’s boards from the device as before, and keeps the device’s settings', () => {
    const device = fakeStorage({
      'note-board:v1': '{}',
      'note-board:open': 'b1',
      'note-board:shares:me': '[]',
      'note-board:shares:someone-else': '[]',
      'note-board:owner-uid': 'me',
      'note-board:theme': 'dark',
      'note-board:calendar-access': '{}',
      unrelated: 'x',
    });
    const tab = fakeStorage({ 'something-else': 'y' });
    vi.stubGlobal('sessionStorage', tab);
    finishDeletion(store, device as unknown as Storage, 'me', []);
    expect([...device.map.keys()].sort()).toEqual(['note-board:owner-uid', 'note-board:shares:someone-else', 'note-board:theme', 'unrelated']);
    // Only the AI key goes from the tab's storage; the note for the sign-in screen is left.
    expect(tab.map.get('something-else')).toBe('y');
    expect(tab.map.get('note-board:account-deleted')).toBe('1');
    expect(reload).toHaveBeenCalled();
  });

  it('removes the AI key and whose it is from both storages; the AI model, limit and count stay', () => {
    const ai = { 'note-board:ai-key': SECRET, 'note-board:ai-key-user': 'me' };
    const device = fakeStorage({ ...ai, 'note-board:ai-model': 'claude-sonnet-5-5', 'note-board:ai-cap': '50', 'note-board:ai-uses': '{}' });
    const tab = fakeStorage(ai);
    vi.stubGlobal('sessionStorage', tab);
    finishDeletion(store, device as unknown as Storage, 'me', []);
    expect(JSON.stringify([...device.map, ...tab.map])).not.toContain('SECRET');
    expect([...device.map.keys()].sort()).toEqual(['note-board:ai-cap', 'note-board:ai-model', 'note-board:ai-uses']);
    expect(tab.map.has('note-board:ai-key-user')).toBe(false);
  });

  it('for a demo person too (their keys have a prefix; the AI key has none)', () => {
    const device = fakeStorage({ 'demo-alice:note-board:v1': '{}', 'note-board:ai-key': SECRET, 'note-board:ai-key-user': 'demo-alice' });
    const tab = fakeStorage({ 'note-board:ai-key': SECRET, 'note-board:ai-key-user': 'demo-alice' });
    vi.stubGlobal('sessionStorage', tab);
    finishDeletion(store, device as unknown as Storage, 'demo-alice', [], 'demo-alice:');
    expect([...device.map.keys()]).toEqual([]);
    expect([...tab.map.keys()]).toEqual(['note-board:account-deleted']);
  });

  it('the tab’s key goes even when the device’s storage is blocked', () => {
    const blocked = { get length(): number { throw new Error('blocked'); }, key: () => null, getItem: () => null, setItem() {}, removeItem() {} };
    const tab = fakeStorage({ 'note-board:ai-key': SECRET, 'note-board:ai-key-user': 'me' });
    vi.stubGlobal('sessionStorage', tab);
    finishDeletion(store, blocked as unknown as Storage, 'me', []);
    expect(tab.map.has('note-board:ai-key')).toBe(false);
    expect(reload).toHaveBeenCalled();
  });
});
