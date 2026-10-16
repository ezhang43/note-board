import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_KEY } from '../model/persist';
import { readWorkspace, WORKSPACE_VERSION } from '../model/workspace';
import { createStore } from './store';
import { startSync, type Remote, type RemoteDoc } from './sync';
import { localVersionStore, restoreFromBackup, restoreVersion } from './versions';

// Due dates are gone (owner, 2026-10-16): a `due` saved on an item before is erased when boards
// are read, wherever they come from, and nothing else on the board is lost.

function memory(init: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(init));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

const card = (title: string) => ({
  kind: 'todo',
  color: 'yellow',
  collapsed: false,
  x: 20,
  y: 40,
  w: null,
  h: null,
  title,
  completedOpen: true,
  items: [
    { id: 'i1', text: 'Pay rent', done: false, due: '2026-10-07', children: [{ id: 'i2', text: 'Online', done: true, due: '2026-10-08', children: [] }] },
    { id: 'i3', text: 'Milk', done: false, children: [] },
  ],
});

/** Saved data from before: two boards, items (and a sub-item) with due dates. */
const saved = (title = 'Jobs') =>
  JSON.stringify({
    version: WORKSPACE_VERSION,
    home: 'home',
    boards: {
      home: { name: 'Home', snap: true, cards: { c1: card(title) }, columns: {}, order: ['c1'] },
      b2: { name: 'Other', snap: false, cards: { c2: card('More') }, columns: {}, order: ['c2'] },
    },
  });

const expected = (title = 'Jobs') => [
  { id: 'i1', text: 'Pay rent', done: false, children: [{ id: 'i2', text: 'Online', done: true, children: [] }] },
  { id: 'i3', text: 'Milk', done: false, children: [] },
].map((it) => ({ ...it, title }));

/** The items of a list, with its title (to show the rest of the card is kept). */
function itemsOf(board: { cards: Record<string, unknown> }, id: string) {
  const c = board.cards[id] as { title: string; items: object[] };
  return c.items.map((it) => ({ ...it, title: c.title }));
}

const noDue = (json: string) => expect(json).not.toMatch(/"due"/);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('due dates saved before are erased on loading', () => {
  it('reading saved data drops every `due` and keeps everything else', () => {
    const got = readWorkspace(saved())!;
    expect(got.ws.boards.home.name).toBe('Home');
    expect(itemsOf(got.ws.boards.home, 'c1')).toEqual(expected());
    expect(itemsOf(got.ws.boards.b2, 'c2')).toEqual(expected('More'));
  });

  it('from this browser (localStorage): loads fine, and the next save drops them', () => {
    const storage = memory({ [BOARD_KEY]: saved() });
    const s = createStore(storage, (fn) => fn());
    expect(itemsOf(s.getState().board, 'c1')).toEqual(expected());
    expect(s.boardName('b2')).toBe('Other');
    s.renameBoard('Home 2');
    vi.runAllTimers();
    noDue(storage.getItem(BOARD_KEY)!);
    expect(storage.getItem(BOARD_KEY)).toContain('Pay rent');
  });

  it('from a backup file', async () => {
    const s = createStore(null, (fn) => fn());
    expect(await restoreFromBackup(s, null, saved())).toEqual([]);
    expect(itemsOf(s.getState().board, 'c1')).toEqual(expected());
    noDue(JSON.stringify(s.workspace()));
  });

  it('from an old version (Version history)', async () => {
    const s = createStore(null, (fn) => fn());
    const versions = localVersionStore(memory());
    await versions.save({ id: 'old', savedAt: 1000, boards: 2, cards: 2, hash: 'x' } as never, saved());
    await restoreVersion(s, versions, 'old', () => 2000);
    expect(itemsOf(s.getState().board, 'c1')).toEqual(expected());
    noDue(JSON.stringify(s.workspace()));
  });

  it('from the online copy (sync)', () => {
    const s = createStore(null, (fn) => fn());
    let send: ((doc: RemoteDoc | null) => void) | null = null;
    const remote: Remote = { watch: (on) => ((send = on), () => {}), write: () => Promise.resolve() };
    startSync(s, remote, { client: 'me', onReady: () => {}, onError: () => {}, onSaveState: () => {} });
    send!({ data: saved(), client: 'laptop' });
    expect(itemsOf(s.getState().board, 'c1')).toEqual(expected());
    noDue(JSON.stringify(s.workspace()));
  });
});
