import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageLike } from '../model/persist';
import { memoryServer, type Person } from './collab';
import { startSharing } from './sharing';
import { createStore } from './store';

// Leaving a share sends one leave, even when the server tells the page it is off the share before
// the leave itself has answered (a flaky browser test on GitHub: join, leave, leave).

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
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

/**
 * `who`'s page, where the server's answer to a leave arrives late (after the share's own watch has
 * already been refused). Its shared-boards list never loads, so only the share's watch can notice
 * the person is off it (as when that stream's message beats the list's in the browser).
 */
function slowLeaveDevice(who: Person, list: 'never' | 'held' = 'never') {
  const storage = memoryStorage();
  const store = createStore(storage, (fn) => fn());
  const real = server.backendFor(who);
  // 'held': the shared-boards list answers, but once `hold` is on its messages wait until `release`.
  const lists = { hold: false, held: [] as (() => void)[] };
  const release = () => lists.held.splice(0).forEach((fn) => fn());
  const watchMyShares: typeof real.watchMyShares =
    list === 'never' ? () => () => {} : (onChange, onError) => real.watchMyShares((ids, confirmed) => (lists.hold ? lists.held.push(() => onChange(ids, confirmed)) : onChange(ids, confirmed)), onError);
  const leave = vi.fn(async (id: string) => {
    await real.leave(id);
    await new Promise((done) => setTimeout(done, 2000));
  });
  const notices: string[] = [];
  const sharing = startSharing(store, { ...real, leave, watchMyShares }, { client: `${who.uid}-page`, storage, onNotice: (t) => notices.push(t) });
  return { store, sharing, leave, notices, lists, release };
}

describe('leaving a share sends one leave', () => {
  const dan = person('dan');

  it('a link to a damaged share: the newcomer is taken off it with one leave, and no notice that it was unshared', async () => {
    await server.server.createShare(dan, 'sbad', 'n1', 'badkey', 'not json {', 'dan-page');
    const page = slowLeaveDevice(person('carol'));
    const joined = page.sharing.join('sbad', 'badkey');
    joined.catch(() => {});
    await settle();
    await expect(joined).rejects.toThrow('This shared board can’t be opened');
    expect(page.leave).toHaveBeenCalledTimes(1);
    expect(server.shares.get('sbad')!.people.map((p) => p.uid)).toEqual(['dan']);
    expect(page.notices).toEqual([]);
  });

  it('leaving a board shared with you: one leave, its boards go, and no notice that it was unshared', async () => {
    const owner = server.backendFor(dan);
    const data = JSON.stringify({ version: 3, home: 'n1', boards: { n1: { name: 'Trip', snap: true, cards: {}, columns: {}, order: [] } } });
    await owner.createShare('sgood', 'n1', 'goodkey', data, 'dan-page');
    const page = slowLeaveDevice(person('carol'));
    const joined = page.sharing.join('sgood', 'goodkey');
    await settle();
    expect(await joined).toBe('n1');
    expect(page.store.workspace().boards.n1).toBeDefined();
    const left = page.sharing.leave('sgood');
    await settle();
    await left;
    expect(page.leave).toHaveBeenCalledTimes(1);
    expect(page.store.workspace().boards.n1).toBeUndefined();
    expect(page.sharing.isShared('n1')).toBe(false);
    expect(server.shares.get('sgood')!.people.map((p) => p.uid)).toEqual(['dan']);
    expect(page.notices).toEqual([]);
  });

  it('a leave that fails leaves the share as it was, and a later removal is still reported', async () => {
    const owner = server.backendFor(dan);
    const data = JSON.stringify({ version: 3, home: 'n1', boards: { n1: { name: 'Trip', snap: true, cards: {}, columns: {}, order: [] } } });
    await owner.createShare('sgood', 'n1', 'goodkey', data, 'dan-page');
    const page = slowLeaveDevice(person('carol'));
    const joined = page.sharing.join('sgood', 'goodkey');
    await settle();
    await joined;
    server.control.offline = true;
    await expect(page.sharing.leave('sgood')).rejects.toThrow();
    server.control.offline = false;
    expect(page.sharing.isShared('n1')).toBe(true);
    await owner.removePerson('sgood', 'carol', { edit: 'e2', comment: 'c2', view: 'v2' });
    await settle();
    expect(page.sharing.isShared('n1')).toBe(false);
    expect(page.notices).toEqual(['“Trip” is no longer shared with you.']);
  });

  it('a late list of shares that still names the damaged share doesn’t open it again (no second leave, no notice)', async () => {
    await server.server.createShare(dan, 'sbad', 'n1', 'badkey', 'not json {', 'dan-page');
    const page = slowLeaveDevice(person('carol'), 'held');
    await settle();
    page.lists.hold = true;
    const joined = page.sharing.join('sbad', 'badkey');
    joined.catch(() => {});
    await settle();
    await expect(joined).rejects.toThrow('This shared board can’t be opened');
    page.release();
    await settle();
    expect(page.leave).toHaveBeenCalledTimes(1);
    expect(server.shares.get('sbad')!.people.map((p) => p.uid)).toEqual(['dan']);
    expect(page.notices).toEqual([]);
  });

  it('after leaving, being added back on another device still brings the board here', async () => {
    const owner = server.backendFor(dan);
    const data = JSON.stringify({ version: 3, home: 'n1', boards: { n1: { name: 'Trip', snap: true, cards: {}, columns: {}, order: [] } } });
    await owner.createShare('sgood', 'n1', 'goodkey', data, 'dan-page');
    const page = slowLeaveDevice(person('carol'), 'held');
    await settle();
    const joined = page.sharing.join('sgood', 'goodkey');
    await settle();
    await joined;
    const left = page.sharing.leave('sgood');
    await settle();
    await left;
    expect(page.sharing.isShared('n1')).toBe(false);
    // Carol opens the link again on her phone.
    await server.server.join(person('carol'), 'sgood', 'goodkey');
    await settle();
    expect(page.sharing.isShared('n1')).toBe(true);
    expect(page.leave).toHaveBeenCalledTimes(1);
  });

  it('the owner deleting it while the newcomer’s leave is on its way still says so, with one leave', async () => {
    const owner = server.backendFor(dan);
    const data = JSON.stringify({ version: 3, home: 'n1', boards: { n1: { name: 'Trip', snap: true, cards: {}, columns: {}, order: [] } } });
    await owner.createShare('sgood', 'n1', 'goodkey', data, 'dan-page');
    const storage = memoryStorage();
    const store = createStore(storage, (fn) => fn());
    const real = server.backendFor(person('carol'));
    let answer = () => {};
    // The leave hasn't reached the server yet when the owner deletes the board.
    const leave = vi.fn(() => new Promise<void>((done) => (answer = done)));
    const notices: string[] = [];
    const sharing = startSharing(store, { ...real, leave, watchMyShares: () => () => {} }, { client: 'carol-page', storage, onNotice: (t) => notices.push(t) });
    const joined = sharing.join('sgood', 'goodkey');
    await settle();
    await joined;
    const left = sharing.leave('sgood');
    await owner.deleteShare('sgood');
    await settle();
    answer();
    await left;
    expect(leave).toHaveBeenCalledTimes(1);
    expect(sharing.isShared('n1')).toBe(false);
    expect(notices).toEqual(['“Trip” was deleted by the person who shared it.']);
  });

  /** Carol's page with a shared-boards list the test sends itself, and a leave the test answers. */
  async function drivenDevice() {
    const owner = server.backendFor(dan);
    const data = JSON.stringify({ version: 3, home: 'n1', boards: { n1: { name: 'Trip', snap: true, cards: {}, columns: {}, order: [] } } });
    await owner.createShare('sgood', 'n1', 'goodkey', data, 'dan-page');
    const storage = memoryStorage();
    const store = createStore(storage, (fn) => fn());
    const carol = person('carol');
    const real = server.backendFor(carol);
    // Each leave reaches the server only when the test says so.
    const waiting: { done: () => void; failed: (e: Error) => void }[] = [];
    const ends = {
      answer: () => waiting.splice(0).forEach((w) => void server.server.leave(carol, 'sgood').then(w.done)),
      fail: (e: Error) => waiting.splice(0).forEach((w) => w.failed(e)),
      // The answer arrives, but its write to the server isn't modeled (it happened before a re-join).
      resolve: () => waiting.splice(0).forEach((w) => w.done()),
      failFirst: (e: Error) => waiting.shift()?.failed(e),
    };
    const leave = vi.fn(() => new Promise<void>((done, failed) => void waiting.push({ done, failed })));
    let list: (ids: string[], confirmed: boolean) => void = () => {};
    const notices: string[] = [];
    const sharing = startSharing(store, { ...real, leave, watchMyShares: (fn) => ((list = fn), () => {}) }, { client: 'carol-page', storage, onNotice: (t) => notices.push(t) });
    list([], true);
    const joined = sharing.join('sgood', 'goodkey');
    await settle();
    await joined;
    list(['sgood'], true);
    return { sharing, leave, notices, ends, list: (ids: string[], confirmed: boolean) => list(ids, confirmed) };
  }

  it('the offline copy of the list dropping the board while the leave is on its way changes nothing: still one leave, no notice', async () => {
    const page = await drivenDevice();
    const left = page.sharing.leave('sgood');
    // Firestore's offline copy shows the leave at once (not confirmed by the server).
    page.list([], false);
    // The server takes Carol off; its word reaches the share's watch before the leave answers.
    await server.server.leave(person('carol'), 'sgood');
    await settle();
    page.ends.answer();
    await left;
    await settle();
    expect(page.leave).toHaveBeenCalledTimes(1);
    expect(page.sharing.isShared('n1')).toBe(false);
    expect(page.notices).toEqual([]);
  });

  it('a leave that fails after the server already took them off still reports the failure, and tries the clean-up once more', async () => {
    const page = await drivenDevice();
    const left = page.sharing.leave('sgood');
    left.catch(() => {});
    await server.server.leave(person('carol'), 'sgood');
    await settle();
    expect(page.sharing.isShared('n1')).toBe(false);
    page.ends.fail(new Error('offline'));
    await expect(left).rejects.toThrow('offline');
    expect(page.leave).toHaveBeenCalledTimes(2);
  });

  it('a late list naming a board whose leave failed still opens it (they are still on it)', async () => {
    const page = await drivenDevice();
    const left = page.sharing.leave('sgood');
    left.catch(() => {});
    page.ends.fail(new Error('offline'));
    await expect(left).rejects.toThrow('offline');
    expect(page.sharing.isShared('n1')).toBe(true);
    page.list(['sgood'], true);
    await settle();
    expect(page.sharing.isShared('n1')).toBe(true);
    expect(page.notices).toEqual([]);
  });

  it('leaving twice at once (a double click) sends one leave', async () => {
    const page = await drivenDevice();
    const first = page.sharing.leave('sgood');
    const second = page.sharing.leave('sgood');
    page.ends.answer();
    await settle();
    await Promise.all([first, second]);
    expect(page.leave).toHaveBeenCalledTimes(1);
    expect(page.sharing.isShared('n1')).toBe(false);
    expect(page.notices).toEqual([]);
  });

  // Owner decision on #269 (2026-11-11).
  it('the server’s list dropping the board while its leave is on its way doesn’t close it: a leave that fails changes nothing', async () => {
    const page = await drivenDevice();
    const left = page.sharing.leave('sgood');
    left.catch(() => {});
    // Firestore's list already shows the leave (it counts as confirmed), before the leave answers.
    page.list([], true);
    await settle();
    expect(page.sharing.isShared('n1')).toBe(true);
    page.ends.fail(new Error('offline'));
    await expect(left).rejects.toThrow('offline');
    expect(page.sharing.isShared('n1')).toBe(true);
    expect(page.leave).toHaveBeenCalledTimes(1);
    expect(page.notices).toEqual([]);
  });

  it('the server’s list dropping the board while its leave is on its way: once the leave answers, the board goes, with one leave', async () => {
    const page = await drivenDevice();
    const left = page.sharing.leave('sgood');
    page.list([], true);
    page.ends.answer();
    await settle();
    await left;
    expect(page.sharing.isShared('n1')).toBe(false);
    expect(page.leave).toHaveBeenCalledTimes(1);
    expect(page.notices).toEqual([]);
  });

  it('the one retry after a failed leave is guarded too: an old list doesn’t reopen the board, and no notice shows', async () => {
    const page = await drivenDevice();
    const left = page.sharing.leave('sgood');
    left.catch(() => {});
    await server.server.leave(person('carol'), 'sgood');
    await settle();
    page.ends.fail(new Error('offline'));
    await expect(left).rejects.toThrow('offline');
    // A list from before the leave arrives while the retry is on its way.
    page.list(['sgood'], true);
    await settle();
    expect(page.leave).toHaveBeenCalledTimes(2);
    expect(page.sharing.isShared('n1')).toBe(false);
    expect(page.notices).toEqual([]);
  });

  it('no retry of a failed leave goes out after signing out', async () => {
    const page = await drivenDevice();
    const left = page.sharing.leave('sgood');
    left.catch(() => {});
    await server.server.leave(person('carol'), 'sgood');
    await settle();
    page.sharing.stop();
    page.ends.fail(new Error('offline'));
    await expect(left).rejects.toThrow('offline');
    await settle();
    expect(page.leave).toHaveBeenCalledTimes(1);
  });

  it('a link to a damaged share whose leave fails gets the one retry too', async () => {
    await server.server.createShare(dan, 'sbad', 'n1', 'badkey', 'not json {', 'dan-page');
    const real = server.backendFor(person('carol'));
    const leave = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation((id: string) => real.leave(id));
    const storage = memoryStorage();
    const sharing = startSharing(createStore(storage, (fn) => fn()), { ...real, leave, watchMyShares: () => () => {} }, { client: 'carol-page', storage });
    const joined = sharing.join('sbad', 'badkey');
    joined.catch(() => {});
    await settle();
    await expect(joined).rejects.toThrow('This shared board can’t be opened');
    expect(leave).toHaveBeenCalledTimes(2);
    expect(server.shares.get('sbad')!.people.map((p) => p.uid)).toEqual(['dan']);
  });

  it('the clean-up leave after being removed isn’t retried (as before)', async () => {
    const page = await drivenDevice();
    await server.backendFor(dan).removePerson('sgood', 'carol', { edit: 'e2', comment: 'c2', view: 'v2' });
    await settle();
    page.ends.fail(new Error('refused'));
    await settle();
    expect(page.leave).toHaveBeenCalledTimes(1);
  });

  it('after being removed, being added back on another device still brings the board here (the clean-up leave doesn’t hold it back)', async () => {
    const owner = server.backendFor(dan);
    const data = JSON.stringify({ version: 3, home: 'n1', boards: { n1: { name: 'Trip', snap: true, cards: {}, columns: {}, order: [] } } });
    await owner.createShare('sgood', 'n1', 'goodkey', data, 'dan-page');
    const page = slowLeaveDevice(person('carol'), 'held');
    await settle();
    const joined = page.sharing.join('sgood', 'goodkey');
    await settle();
    await joined;
    await owner.removePerson('sgood', 'carol', { edit: 'e2', comment: 'c2', view: 'v2' });
    await settle();
    expect(page.sharing.isShared('n1')).toBe(false);
    // Carol opens the new link on her phone.
    await server.server.join(person('carol'), 'sgood', 'e2');
    await settle();
    expect(page.sharing.isShared('n1')).toBe(true);
  });

  it('removed again while the first clean-up leave is still on its way: still says so', async () => {
    const page = await drivenDevice();
    const owner = server.backendFor(dan);
    await owner.removePerson('sgood', 'carol', { edit: 'e2', comment: 'c2', view: 'v2' });
    await settle();
    // Carol opens the new link while the clean-up leave hasn't answered; then she is removed again.
    const joined = page.sharing.join('sgood', 'e2');
    await settle();
    expect(await joined).toBe('n1');
    await owner.removePerson('sgood', 'carol', { edit: 'e3', comment: 'c3', view: 'v3' });
    await settle();
    expect(page.sharing.isShared('n1')).toBe(false);
    expect(page.notices).toEqual(['“Trip” is no longer shared with you.', '“Trip” is no longer shared with you.']);
    expect(page.leave).toHaveBeenCalledTimes(2);
  });


  it('opening the link of a board being left (still here) doesn’t let an old list bring it back', async () => {
    const page = await drivenDevice();
    const left = page.sharing.leave('sgood');
    await page.sharing.join('sgood', 'goodkey');
    page.ends.answer();
    await left;
    await settle();
    page.list(['sgood'], true);
    await settle();
    expect(page.leave).toHaveBeenCalledTimes(1);
    expect(page.notices).toEqual([]);
  });

  it('a leave answering after the board was reopened from a new link doesn’t close the reopened board', async () => {
    const page = await drivenDevice();
    const left = page.sharing.leave('sgood');
    await server.backendFor(dan).removePerson('sgood', 'carol', { edit: 'e2', comment: 'c2', view: 'v2' });
    await settle();
    expect(page.sharing.isShared('n1')).toBe(false);
    const joined = page.sharing.join('sgood', 'e2');
    await settle();
    expect(await joined).toBe('n1');
    page.ends.resolve();
    await left;
    await settle();
    expect(page.sharing.isShared('n1')).toBe(true);
  });

  it('the server saying they are off it just as the leave answers (before the board has gone) is still that leave', async () => {
    const owner = server.backendFor(dan);
    const data = JSON.stringify({ version: 3, home: 'n1', boards: { n1: { name: 'Trip', snap: true, cards: {}, columns: {}, order: [] } } });
    await owner.createShare('sgood', 'n1', 'goodkey', data, 'dan-page');
    const storage = memoryStorage();
    const real = server.backendFor(person('carol'));
    // The share's watch, so the test can say "no access" at the moment it chooses.
    const refusals: ((e: unknown) => void)[] = [];
    const watchShare: typeof real.watchShare = (id, onChange, onError) => (refusals.push(onError), real.watchShare(id, onChange, () => {}));
    let answered: Promise<void> = Promise.resolve();
    const leave = vi.fn((id: string) => (answered = real.leave(id)));
    const notices: string[] = [];
    const sharing = startSharing(createStore(storage, (fn) => fn()), { ...real, leave, watchShare, watchMyShares: () => () => {} }, { client: 'carol-page', storage, onNotice: (t) => notices.push(t) });
    const joined = sharing.join('sgood', 'goodkey');
    await settle();
    await joined;
    const left = sharing.leave('sgood');
    // Runs right after the page has heard the leave answer, before leave() closes the board.
    void answered.then(() => refusals.forEach((no) => no(Object.assign(new Error('No longer shared with you'), { code: 'permission-denied' }))));
    await left;
    await settle();
    expect(leave).toHaveBeenCalledTimes(1);
    expect(notices).toEqual([]);
    expect(sharing.isShared('n1')).toBe(false);
  });
});
