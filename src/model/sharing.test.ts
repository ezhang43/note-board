import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createBoardCard } from './cards';
import { groupBoardIds, joinLink, parseJoin, readShare, serializeShare } from './sharing';
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

describe('which boards a shared board takes with it', () => {
  it('the board and every board inside it, however deep', () => {
    expect(groupBoardIds(sample(), 'trip', [], new Set()).sort()).toEqual(['days', 'hotel', 'trip']);
  });

  it('boards it had before stay in it, even once no card opens them', () => {
    expect(groupBoardIds(sample(), 'trip', ['loose'], new Set()).sort()).toEqual(['days', 'hotel', 'loose', 'trip']);
  });

  it('never the home board, nor a board another share already holds', () => {
    const ws = sample();
    ws.boards.hotel = opening(ws.boards.hotel, 'home');
    expect(groupBoardIds(ws, 'trip', [], new Set(['days'])).sort()).toEqual(['trip']);
    expect(groupBoardIds(ws, 'trip', [], new Set()).sort()).toEqual(['days', 'hotel', 'trip']);
  });

  it('nothing when the board isn’t here', () => {
    expect(groupBoardIds(sample(), 'gone', [], new Set())).toEqual([]);
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
