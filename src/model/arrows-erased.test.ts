import { describe, expect, it } from 'vitest';
import { addCard, addColumn, createBoard } from './board';
import { createCard, createColumn } from './cards';
import { mergeBoardSets } from './merge';
import { BOARD_VERSION, parseBoard, readBoard, readBoardData, serializeBoard } from './persist';
import { readShare } from './sharing';
import type { Board } from './types';
import { parseWorkspace, readWorkspace, serializeWorkspace } from './workspace';

// Arrows between cards and containers were removed (owner, 2026-10-16): arrows saved before are
// erased when the data is read, so the next save drops them, and nothing else is lost.

function board(): Board {
  let b = createBoard();
  b = addCard(b, createCard('note', 'n1'), { type: 'loose', x: 0, y: 0 });
  b = addCard(b, createCard('note', 'n2'), { type: 'loose', x: 400, y: 0 });
  b = addColumn(b, { ...createColumn('c1'), x: 0, y: 400 });
  b = addCard(b, createCard('todo', 't1'), { type: 'column', columnId: 'c1', index: 0 });
  return b;
}

const ARROWS = [{ id: 'a1', from: 'n1', to: 'n2' }, { id: 'a2', from: 'n2', to: 'c1' }, 'junk', { id: 3 }];
/** Board data as an older version of the app saved it, with arrows. */
const withArrows = (b: Board) => ({ ...JSON.parse(JSON.stringify(b)), arrows: ARROWS });
const wsRaw = (boards: Record<string, Board>) => JSON.stringify({ version: 3, home: 'home', boards: Object.fromEntries(Object.entries(boards).map(([id, b]) => [id, withArrows(b)])) });

describe('arrows saved before are erased on load (owner, 2026-10-16)', () => {
  it('one board: arrows go, everything else is kept', () => {
    const b = board();
    expect(readBoardData(BOARD_VERSION, withArrows(b))).toEqual(b);
    const raw = JSON.stringify({ version: BOARD_VERSION, board: withArrows(b) });
    expect(readBoard(raw)).toEqual(b);
    expect(parseBoard(raw)).toEqual(b);
    expect(serializeBoard(parseBoard(raw))).not.toContain('arrows');
  });

  it('every board of a workspace (this device, online copy, backup files, Version history)', () => {
    const b = board();
    const raw = wsRaw({ home: b, work: { ...b, name: 'Work' } });
    const got = readWorkspace(raw)!;
    expect(got.ws.boards).toEqual({ home: b, work: { ...b, name: 'Work' } });
    expect(parseWorkspace(raw).boards.home).toEqual(b);
    expect(serializeWorkspace(got.ws)).not.toContain('arrows');
  });

  it('shared boards, and combining someone else’s changes with mine', () => {
    const b = board();
    const shared = readShare(wsRaw({ home: b }))!;
    expect(shared.boards.home).toEqual(b);
    const theirs = readWorkspace(wsRaw({ home: { ...b, name: 'Theirs' } }))!.ws.boards;
    const merged = mergeBoardSets({ home: b }, { home: b }, theirs);
    expect(merged.home).toEqual({ ...b, name: 'Theirs' });
    expect('arrows' in merged.home).toBe(false);
  });

  it('damaged arrow data never stops a board loading', () => {
    const b = board();
    for (const arrows of [null, 7, 'x', [null], { a: 1 }]) {
      expect(readBoardData(BOARD_VERSION, { ...withArrows(b), arrows })).toEqual(b);
    }
  });
});
