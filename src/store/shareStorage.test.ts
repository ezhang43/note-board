import { describe, expect, it, vi } from 'vitest';
import { createBoard } from '../model/board';
import { createBoardCard } from '../model/cards';
import type { StorageLike } from '../model/persist';
import { serializeShare } from '../model/sharing';
import type { Workspace } from '../model/workspace';
import {
  baseKey,
  boardsInKeptShares,
  commentsSeenKey,
  noteOwn,
  ownBoardsKey,
  readBase,
  readOwn,
  readRemembered,
  readSeen,
  saveBase,
  saveRemembered,
  saveSeen,
  sharesKey,
} from './shareStorage';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  const setItem = vi.fn((k: string, v: string) => void data.set(k, v));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem,
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('quota');
    },
  };
}

describe('storage key preservation', () => {
  it('keeps the exact localStorage key formats', () => {
    expect(baseKey('s123')).toBe('note-board:share-base:s123');
    expect(sharesKey('u1')).toBe('note-board:shares:u1');
    expect(commentsSeenKey('u1')).toBe('note-board:comments-seen:u1');
    expect(ownBoardsKey('u1')).toBe('note-board:own-boards:u1');
  });
});

describe('readSeen / saveSeen', () => {
  it('falls back to empty object on missing, null, corrupted, or wrong-shape JSON', () => {
    expect(readSeen(null, 'u1')).toEqual({});
    expect(readSeen(memoryStorage(), 'u1')).toEqual({});
    expect(readSeen(memoryStorage({ [commentsSeenKey('u1')]: '{bad json' }), 'u1')).toEqual({});
    expect(readSeen(memoryStorage({ [commentsSeenKey('u1')]: '[1,2]' }), 'u1')).toEqual({});
    expect(readSeen(memoryStorage({ [commentsSeenKey('u1')]: '"str"' }), 'u1')).toEqual({});
    expect(readSeen(throwingStorage(), 'u1')).toEqual({});
  });

  it('keeps only numeric timestamps', () => {
    const s = memoryStorage({ [commentsSeenKey('u1')]: JSON.stringify({ 's1/c1': 100, 's1/c2': 'bad', 's1/c3': null }) });
    expect(readSeen(s, 'u1')).toEqual({ 's1/c1': 100 });
  });

  it('merges later timestamps from another tab and drops a share when requested', () => {
    const s = memoryStorage({ [commentsSeenKey('u1')]: JSON.stringify({ 's1/c1': 200, 's1/c2': 50, 's2/c9': 300 }) });
    const seen: Record<string, number> = { 's1/c1': 100, 's1/c2': 150, 's1/c3': 400 };
    saveSeen(s, 'u1', seen);
    expect(seen).toEqual({ 's1/c1': 200, 's1/c2': 150, 's1/c3': 400, 's2/c9': 300 });
    expect(JSON.parse(s.data.get(commentsSeenKey('u1'))!)).toEqual(seen);

    saveSeen(s, 'u1', seen, 's1');
    expect(seen).toEqual({ 's2/c9': 300 });
    expect(JSON.parse(s.data.get(commentsSeenKey('u1'))!)).toEqual({ 's2/c9': 300 });
  });

  it('swallows storage-full errors', () => {
    expect(() => saveSeen(throwingStorage(), 'u1', { 's1/c1': 10 })).not.toThrow();
  });
});

describe('readOwn / noteOwn', () => {
  it('falls back to empty array on corrupted or non-array JSON and filters non-strings', () => {
    expect(readOwn(null, 'u1')).toEqual([]);
    expect(readOwn(memoryStorage({ [ownBoardsKey('u1')]: '{nope' }), 'u1')).toEqual([]);
    expect(readOwn(memoryStorage({ [ownBoardsKey('u1')]: '{"a":1}' }), 'u1')).toEqual([]);
    expect(readOwn(memoryStorage({ [ownBoardsKey('u1')]: JSON.stringify(['b1', 42, null, 'b2']) }), 'u1')).toEqual(['b1', 'b2']);
  });

  it('records own sub-boards, skips shared/taken boards, and only writes when the set grows', () => {
    const home = { ...createBoard(), name: 'Home' };
    const mine = { ...createBoard(), name: 'Mine' };
    const shared = { ...createBoard(), name: 'Shared' };
    const sharedSub = { ...createBoard(), name: 'Shared Sub' };
    const cardMine = createBoardCard('mine', 'k1');
    const cardShared = createBoardCard('sharedSub', 'k2');
    home.cards[cardMine.id] = cardMine;
    shared.cards[cardShared.id] = cardShared;
    const ws: Workspace = {
      home: 'home',
      boards: { home, mine, shared, sharedSub },
    };

    const s = memoryStorage();
    const own = new Set<string>(['stale']);
    noteOwn(s, 'u1', own, ws, new Set(['shared', 'sharedSub']));
    expect(own.has('mine')).toBe(true);
    expect(own.has('sharedSub')).toBe(false);
    // Prunes boards no longer in ws.boards when writing.
    expect(JSON.parse(s.data.get(ownBoardsKey('u1'))!)).toEqual(['mine']);

    s.setItem.mockClear();
    noteOwn(s, 'u1', own, ws, new Set(['shared', 'sharedSub']));
    expect(s.setItem).not.toHaveBeenCalled();
  });
});

describe('readBase / saveBase', () => {
  it('round-trips a share base and clears it when root/base is null', () => {
    const s = memoryStorage();
    const board = { ...createBoard(), name: 'Trip' };
    saveBase(s, 's1', 'b1', { b1: board }, 3);
    const loaded = readBase(s, 's1');
    expect(loaded).toEqual({ root: 'b1', boards: { b1: board }, rev: 3 });

    saveBase(s, 's1', null, null, 0);
    expect(s.data.get(baseKey('s1'))).toBe('');
    expect(readBase(s, 's1')).toBeNull();
  });

  it('returns null on missing, corrupted, or invalid share base data', () => {
    expect(readBase(null, 's1')).toBeNull();
    expect(readBase(memoryStorage(), 's1')).toBeNull();
    expect(readBase(memoryStorage({ [baseKey('s1')]: '{bad' }), 's1')).toBeNull();
    expect(readBase(memoryStorage({ [baseKey('s1')]: JSON.stringify({ rev: '3', data: '{}' }) }), 's1')).toBeNull();
    expect(readBase(memoryStorage({ [baseKey('s1')]: JSON.stringify({ rev: 1, data: 'not-a-share' }) }), 's1')).toBeNull();
  });
});

describe('readRemembered / saveRemembered', () => {
  it('handles missing, corrupted, empty, partial, and valid share lists', () => {
    expect(readRemembered(null, 'u1')).toEqual({ items: [], complete: false });
    expect(readRemembered(memoryStorage({ [sharesKey('u1')]: '{bad' }), 'u1')).toEqual({ items: [], complete: false });
    expect(readRemembered(memoryStorage({ [sharesKey('u1')]: '{}' }), 'u1')).toEqual({ items: [], complete: false });
    expect(readRemembered(memoryStorage({ [sharesKey('u1')]: '[]' }), 'u1')).toEqual({ items: [], complete: true });

    const valid = [
      { id: 's1', owner: true, ownerUid: 'u1', role: 'edit' },
      { id: 's2', owner: false, ownerUid: 'u2', role: 'bogus' },
    ];
    expect(readRemembered(memoryStorage({ [sharesKey('u1')]: JSON.stringify(valid) }), 'u1')).toEqual({
      items: [
        { id: 's1', owner: true, ownerUid: 'u1', role: 'edit' },
        { id: 's2', owner: false, ownerUid: 'u2', role: null },
      ],
      complete: true,
    });

    const partial = [{ id: 's1', owner: true, ownerUid: 'u1' }, { id: 123 }];
    expect(readRemembered(memoryStorage({ [sharesKey('u1')]: JSON.stringify(partial) }), 'u1')).toEqual({
      items: [{ id: 's1', owner: true, ownerUid: 'u1', role: null }],
      complete: false,
    });
  });

  it('writes only when changed and omits null role', () => {
    const s = memoryStorage();
    const items = [
      { id: 's1', owner: true, ownerUid: 'u1', role: 'edit' as const },
      { id: 's2', owner: false, ownerUid: 'u2', role: null },
    ];
    const first = saveRemembered(s, 'u1', items, '');
    expect(s.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(first)).toEqual([
      { id: 's1', owner: true, ownerUid: 'u1', role: 'edit' },
      { id: 's2', owner: false, ownerUid: 'u2' },
    ]);

    const second = saveRemembered(s, 'u1', items, first);
    expect(second).toBe(first);
    expect(s.setItem).toHaveBeenCalledTimes(1);
  });
});

describe('boardsInKeptShares', () => {
  it('returns only the account’s kept share boards and skips damaged entries', () => {
    const b1 = { ...createBoard(), name: 'B1' };
    const b2 = { ...createBoard(), name: 'B2' };
    const s = memoryStorage({
      [sharesKey('alice')]: JSON.stringify([{ id: 's1' }, { id: 's-bad' }]),
      [sharesKey('bob')]: '{corrupt',
      [baseKey('s1')]: JSON.stringify({ rev: 1, data: serializeShare('b1', { b1 }) }),
      [baseKey('s-bad')]: '{corrupt',
      [baseKey('s2')]: JSON.stringify({ rev: 1, data: serializeShare('b2', { b2 }) }),
    });
    expect([...boardsInKeptShares(s, 'alice')]).toEqual(['b1']);
    // When carol has no list yet, she sees unlisted kept shares (s2) and ignores alice's (s1, s-bad) and bob's damaged list.
    expect([...boardsInKeptShares(s, 'carol')]).toEqual(['b2']);
  });
});
