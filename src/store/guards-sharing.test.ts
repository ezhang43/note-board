import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageLike } from '../model/persist';
import { memoryServer, type CollabBackend, type Person } from './collab';
import { startSharing } from './sharing';
import { createStore } from './store';

// Guards for sharing (review pass, job 156). The shared list a page gets from the device's offline copy
// may be out of date, so a share missing from it is never taken as left; only the server's own list is.

function memoryStorage(): StorageLike & { length: number; key(i: number): string | null } {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
  };
}

const person = (uid: string): Person => ({ uid, name: uid[0].toUpperCase() + uid.slice(1), photo: null });

let server: ReturnType<typeof memoryServer>;
beforeEach(() => {
  vi.useFakeTimers();
  server = memoryServer();
});
afterEach(() => vi.useRealTimers());

async function settle() {
  for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(1000);
}

describe('a list of shares from the offline copy never takes a share away (G21)', () => {
  /** Bob has joined Alice's board "Trip" on a device; the page is then opened again with a list of shares that he drives by hand. */
  async function secondPage() {
    const aliceStorage = memoryStorage();
    const alice = createStore(aliceStorage, (fn) => fn());
    const aliceSharing = startSharing(alice, server.backendFor(person('alice')), { client: 'alice-page', storage: aliceStorage });
    await settle();
    const trip = alice.newBoard();
    alice.renameBoard('Trip');
    const shareId = await aliceSharing.share(trip);
    await settle();

    const storage = memoryStorage();
    const bob = createStore(storage, (fn) => fn());
    const bobSharing = startSharing(bob, server.backendFor(person('bob')), { client: 'bob-page-1', storage });
    await settle();
    const joined = bobSharing.join(shareId, server.shares.get(shareId)!.links.edit!);
    await settle();
    await joined;
    bobSharing.stop();
    bob.flush();

    // The page opens again on the same device; its list of shares is answered by hand.
    const reopened = createStore(storage, (fn) => fn());
    const notices: string[] = [];
    const list: { answer: (ids: string[], confirmed: boolean) => void } = { answer: () => {} };
    const base = server.backendFor(person('bob'));
    const backend: CollabBackend = {
      ...base,
      watchMyShares: (onChange) => {
        list.answer = onChange;
        return () => {};
      },
    };
    startSharing(reopened, backend, { client: 'bob-page-2', storage, onNotice: (t) => notices.push(t) });
    await settle();
    return { reopened, trip, shareId, list, notices };
  }

  it('the share is on this device from the start, from what was kept', async () => {
    const { reopened, trip, shareId } = await secondPage();
    expect(reopened.workspace().boards[trip]?.name).toBe('Trip');
    expect(reopened.getState().ui.shares.map((s) => s.id)).toEqual([shareId]);
  });

  it('a list that does not have it, from the offline copy, changes nothing', async () => {
    const { reopened, trip, shareId, list, notices } = await secondPage();
    list.answer([], false);
    await settle();
    expect(reopened.workspace().boards[trip]?.name).toBe('Trip');
    expect(reopened.getState().ui.shares.map((s) => s.id)).toEqual([shareId]);
    expect(notices).toEqual([]);
  });

  it('the same list from the server takes the share off this device, quietly (it was left on another device)', async () => {
    const { reopened, trip, list, notices } = await secondPage();
    list.answer([], false);
    list.answer([], true);
    await settle();
    expect(reopened.workspace().boards[trip]).toBeUndefined();
    expect(reopened.getState().ui.shares).toEqual([]);
    expect(notices).toEqual([]);
  });
});
