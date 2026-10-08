import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createBoardCard } from './cards';
import { boardRights, boardsToShare, clashingBoards, groupBoardIds, joinLink, keptNotice, parseJoin, readShare, restorable, serializeShare } from './sharing';
import type { Board } from './types';
import type { Workspace } from './workspace';

const opening = (b: Board, to: string, id = `card-${to}`) => B.addCard(b, createBoardCard(to, id), { type: 'loose', x: 0, y: 0 });

function sample(): Workspace {
  // home → trip → (days → hotel), home → work; loose is opened by no card.
  return {
    home: 'home',
    boards: {
      home: opening(opening(B.createBoard(), 'trip'), 'work'),
      trip: opening(B.createBoard(), 'days'),
      days: opening(B.createBoard(), 'hotel'),
      hotel: B.createBoard(),
      work: B.createBoard(),
      loose: B.createBoard(),
    },
  };
}

describe('which boards sharing a board takes with it', () => {
  it('the board and every board inside it, however deep', () => {
    expect(boardsToShare(sample(), 'trip', new Set()).sort()).toEqual(['days', 'hotel', 'trip']);
  });

  it('never the home board, nor a board another share already holds', () => {
    const ws = sample();
    ws.boards.hotel = opening(ws.boards.hotel, 'home');
    expect(boardsToShare(ws, 'trip', new Set(['days'])).sort()).toEqual(['trip']);
    expect(boardsToShare(ws, 'trip', new Set()).sort()).toEqual(['days', 'hotel', 'trip']);
    expect(boardsToShare(ws, 'home', new Set())).toEqual([]);
  });

  it('nothing when the board isn’t here', () => {
    expect(boardsToShare(sample(), 'gone', new Set())).toEqual([]);
  });
});

describe('which boards a shared board holds (security review fix, 2026-10-05)', () => {
  /** The share as last agreed online: trip and days (days opens hotel, which isn’t in it). */
  const agreed = (ws: Workspace) => ({ trip: ws.boards.trip, days: ws.boards.days });

  it('the boards in its data that are here', () => {
    const ws = sample();
    expect(groupBoardIds(ws, 'trip', { ...agreed(ws), elsewhere: B.createBoard() }, new Set()).sort()).toEqual(['days', 'trip']);
  });

  it('boards it had stay in it, even once no card opens them', () => {
    const ws = sample();
    expect(groupBoardIds(ws, 'trip', { ...agreed(ws), loose: ws.boards.loose }, new Set()).sort()).toEqual(['days', 'loose', 'trip']);
  });

  it('nothing when its starting board isn’t one of its boards', () => {
    const ws = sample();
    expect(groupBoardIds(ws, 'work', agreed(ws), new Set())).toEqual([]);
    expect(groupBoardIds(ws, 'trip', {}, new Set())).toEqual([]);
  });

  it('a board card that came with its data never takes in a board outside it', () => {
    const ws = sample();
    // days opens hotel in the agreed data too: hotel stays this person’s own.
    expect(groupBoardIds(ws, 'trip', agreed(ws), new Set())).not.toContain('hotel');
    // Nor a card whose board was changed online to one of this person’s own.
    const sneaky = { ...ws.boards.trip, cards: { ...ws.boards.trip.cards, 'card-days': { ...ws.boards.trip.cards['card-days'], boardId: 'work' } } } as Board;
    const here = { ...ws, boards: { ...ws.boards, trip: sneaky } };
    expect(groupBoardIds(here, 'trip', { trip: sneaky }, new Set())).toEqual(['trip']);
  });

  it('a board card added here since takes its board in, with the boards inside that', () => {
    const ws = sample();
    const before = { trip: B.createBoard() };
    // trip now opens days (added here), and days opens hotel.
    expect(groupBoardIds(ws, 'trip', before, new Set()).sort()).toEqual(['days', 'hotel', 'trip']);
  });

  it('never the home board, nor a board another share holds', () => {
    const ws = sample();
    expect(groupBoardIds(ws, 'trip', { ...agreed(ws), home: ws.boards.home }, new Set(['days']))).toEqual(['trip']);
    expect(groupBoardIds(ws, 'home', { home: ws.boards.home }, new Set())).toEqual([]);
  });
});

describe('boards in a share that clash with this person’s own', () => {
  it('a board in the share’s data with the id of a board here that isn’t in the share', () => {
    const ws = sample();
    const incoming = { trip: B.createBoard(), work: B.createBoard(), fresh: B.createBoard() };
    expect(clashingBoards(ws, incoming, ['trip']).sort()).toEqual(['work']);
    expect(clashingBoards(ws, incoming, []).sort()).toEqual(['trip', 'work']);
  });
});

describe('the shared boards as saved online', () => {
  it('read back as they were written', () => {
    const ws = sample();
    const boards = { trip: ws.boards.trip, days: ws.boards.days };
    expect(readShare(serializeShare('trip', boards))).toEqual({ root: 'trip', boards });
  });

  it('anything unreadable gives null', () => {
    expect(readShare('nonsense')).toBeNull();
    expect(readShare(JSON.stringify({ version: 99, home: 'x', boards: {} }))).toBeNull();
  });
});

describe('share links', () => {
  it('a link opens back to the share it was made for', () => {
    const link = joinLink('https://ezhang43.github.io/note-board/', 's_ab12cd34', 'k3y9xyzk3y9xyz00');
    expect(link).toBe('https://ezhang43.github.io/note-board/?join=s_ab12cd34.k3y9xyzk3y9xyz00');
    expect(parseJoin(new URL(link).search)).toEqual({ id: 's_ab12cd34', key: 'k3y9xyzk3y9xyz00' });
  });

  it('a damaged or missing link is ignored', () => {
    expect(parseJoin('')).toBeNull();
    expect(parseJoin('?join=nodot')).toBeNull();
    expect(parseJoin('?join=s_1/../x.key')).toBeNull();
  });
});

describe('which boards a shared board holds: code review fixes (2026-10-06)', () => {
  it('a board card that came with its data, moved to another of its boards, still takes nothing in', () => {
    const ws = sample();
    const planted = opening(ws.boards.trip, 'work');
    const agreed = { trip: planted, days: ws.boards.days };
    // Here, the card was moved from trip onto days.
    const here = { ...ws, boards: { ...ws.boards, days: opening(ws.boards.days, 'work') } };
    expect(groupBoardIds(here, 'trip', agreed, new Set())).not.toContain('work');
  });

  it('a card that came with an earlier version (`cameWith`) takes nothing in either', () => {
    const ws = sample();
    const here = { ...ws, boards: { ...ws.boards, trip: opening(ws.boards.trip, 'work') } };
    expect(groupBoardIds(here, 'trip', { trip: ws.boards.trip }, new Set(), new Set(['card-work>work']))).not.toContain('work');
  });

  it('with its starting board gone from here, it still holds its other boards', () => {
    const ws = sample();
    const { trip: _gone, ...rest } = ws.boards;
    const here = { ...ws, boards: rest };
    expect(groupBoardIds(here, 'trip', { trip: ws.boards.trip, days: ws.boards.days }, new Set())).toEqual(['days']);
  });
});

describe('which boards a shared board holds: a card to one of your own boards (2026-10-06)', () => {
  it('a board card added here to a board that was already one of this person’s own doesn’t take it in', () => {
    const ws = sample();
    // trip opens days; days was one of this person’s own boards before the card was added.
    const before = { trip: B.createBoard() };
    expect(groupBoardIds(ws, 'trip', before, new Set(), new Set(), new Set(['days']))).toEqual(['trip']);
  });

  it('a board new here (a sub-board made on the shared board) is still taken in', () => {
    const ws = sample();
    expect(groupBoardIds(ws, 'trip', { trip: B.createBoard() }, new Set(), new Set(), new Set(['work'])).sort()).toEqual(['days', 'hotel', 'trip']);
  });

  it('a board in the share’s own data stays in it, whatever this person had', () => {
    const ws = sample();
    expect(groupBoardIds(ws, 'trip', { trip: ws.boards.trip, days: ws.boards.days }, new Set(), new Set(), new Set(['days'])).sort()).toEqual(['days', 'trip']);
  });
});

describe('what this person may do with a board', () => {
  const share = (owner: boolean) => ({ id: 's1', root: 'trip', boards: ['trip', 'days'], owner, ownerUid: 'a', people: [], link: null });

  it('their own boards: everything, but the home board can’t be deleted', () => {
    expect(boardRights([], 'trip', 'home')).toEqual({ rename: true, delete: true, deleteForEveryone: false, restore: true });
    expect(boardRights([share(false)], 'home', 'home')).toEqual({ rename: true, delete: false, deleteForEveryone: false, restore: true });
  });

  it('a board they shared: everything, and deleting it deletes it for everyone', () => {
    expect(boardRights([share(true)], 'trip', 'home')).toEqual({ rename: true, delete: true, deleteForEveryone: true, restore: true });
    expect(boardRights([share(true)], 'days', 'home')).toEqual({ rename: true, delete: true, deleteForEveryone: false, restore: true });
  });

  it('a board someone shared with them: no renaming, deleting or restoring it', () => {
    expect(boardRights([share(false)], 'trip', 'home')).toEqual({ rename: false, delete: false, deleteForEveryone: false, restore: false });
  });

  it('a board inside one shared with them: renamed and deleted like any board, but not restored', () => {
    expect(boardRights([share(false)], 'days', 'home')).toEqual({ rename: true, delete: true, deleteForEveryone: false, restore: false });
  });
});

describe('which boards a restore may put back (owner, 2026-10-06)', () => {
  const share = (owner: boolean, root = 'trip', boards = ['trip', 'days']) => ({ root, boards, owner });

  it('their own boards and boards they shared: all of them', () => {
    expect(restorable([], ['home', 'trip'])).toEqual({ ids: ['home', 'trip'], kept: [] });
    expect(restorable([share(true)], ['home', 'trip', 'days'])).toEqual({ ids: ['home', 'trip', 'days'], kept: [] });
  });

  it('a share someone shared with them: its starting board and every board in it are left as they are', () => {
    expect(restorable([share(false)], ['home', 'trip', 'days', 'work'])).toEqual({ ids: ['home', 'work'], kept: ['trip'] });
    // Only a board inside it is touched: the share is still named by its starting board, once.
    expect(restorable([share(false)], ['days'])).toEqual({ ids: [], kept: ['trip'] });
  });

  it('a starting board missing from its own board list still counts as shared with them', () => {
    expect(restorable([share(false, 'trip', [])], ['trip'])).toEqual({ ids: [], kept: ['trip'] });
  });

  it('the notice names what was left as it is', () => {
    expect(keptNotice(['trip'], () => 'Trip')).toBe('“Trip” is shared with you, so it was left as it is.');
    expect(keptNotice(['trip', 'work'], (id) => ({ trip: 'Trip', work: 'Work' })[id]!)).toBe('“Trip” and “Work” are shared with you, so they were left as they are.');
    expect(keptNotice(['a', 'b', 'c'], (id) => id.toUpperCase())).toBe('“A”, “B” and “C” are shared with you, so they were left as they are.');
    expect(keptNotice(['x'], () => '')).toBe('“Untitled board” is shared with you, so it was left as it is.');
  });
});