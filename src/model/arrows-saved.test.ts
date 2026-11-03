import { describe, expect, it } from 'vitest';
import { addArrow } from './arrows';
import { addCard, addColumn, createBoard } from './board';
import { createCard, createColumn } from './cards';
import { mergeBoardSets } from './merge';
import { readShare, savedByNewer } from './sharing';
import type { Board } from './types';
import { asVersion, readWorkspace, serializeWorkspace, WORKSPACE_VERSION } from './workspace';
import { sameSaved } from './versions';
import { contentHash } from './versions';

// Arrows are saved from workspace version 5 (job card-arrows, 2026-11-03). Version 3 and 4 boards
// read with no arrows (any arrows still in them are the old ones the owner chose to erase on
// 2026-10-16); version 5 boards keep theirs, minus any that are damaged.

function board(): Board {
  let b = createBoard();
  b = addCard(b, createCard('note', 'n1'), { type: 'loose', x: 0, y: 0 });
  b = addCard(b, createCard('note', 'n2'), { type: 'loose', x: 400, y: 0 });
  b = addColumn(b, { ...createColumn('c1'), x: 0, y: 400 });
  b = addCard(b, createCard('todo', 't1'), { type: 'column', columnId: 'c1', index: 0 });
  return b;
}

const raw = (version: number, boards: Record<string, unknown>) => JSON.stringify({ version, home: 'home', boards });

describe('saved version 5', () => {
  it('is the version boards are saved as now', () => {
    expect(WORKSPACE_VERSION).toBe(5);
    expect(JSON.parse(serializeWorkspace({ home: 'home', boards: { home: board() } })).version).toBe(5);
  });

  it('a version 4 board reads as it was, with no arrows (the migration adds an empty list: no field)', () => {
    const b = board();
    const got = readWorkspace(raw(4, { home: JSON.parse(JSON.stringify(b)) }))!;
    expect(got.ws.boards.home).toEqual(b);
    expect('arrows' in got.ws.boards.home).toBe(false);
  });

  it('old arrows left in a version 3 or 4 board stay erased (owner, 2026-10-16)', () => {
    const b = board();
    for (const v of [3, 4]) {
      const got = readWorkspace(raw(v, { home: { ...JSON.parse(JSON.stringify(b)), arrows: [{ id: 'r1', from: 'n1', to: 'n2' }] } }))!;
      expect(got.ws.boards.home).toEqual(b);
    }
  });

  it('arrows come back exactly as saved, on every board of the workspace', () => {
    const home = addArrow(board(), 'n1', 'n2', 'a1')!;
    const work = addArrow({ ...board(), name: 'Work' }, 'c1', 'n2', 'a2')!;
    const text = serializeWorkspace({ home: 'home', boards: { home, work } });
    const got = readWorkspace(text)!;
    expect(got.ws.boards).toEqual({ home, work });
    expect(serializeWorkspace(got.ws)).toBe(text);
  });

  it('damaged arrows are dropped one by one; the board and its other arrows load', () => {
    const b = board();
    const saved = { ...JSON.parse(JSON.stringify(b)), arrows: [{ id: 'a1', from: 'n1', to: 'n2' }, { id: 'a2', from: 'n1', to: 'gone' }, { from: 'n1', to: 'c1' }, 'junk'] };
    expect(readWorkspace(raw(5, { home: saved }))!.ws.boards.home).toEqual({ ...b, arrows: [{ id: 'a1', from: 'n1', to: 'n2' }] });
    for (const arrows of [null, 7, 'x', [null], { a: 1 }, []]) {
      expect(readWorkspace(raw(5, { home: { ...JSON.parse(JSON.stringify(b)), arrows } }))!.ws.boards.home).toEqual(b);
    }
  });

  it('shared boards keep their arrows; combining edits keeps both people’s', () => {
    const b = addArrow(board(), 'n1', 'n2', 'a1')!;
    expect(readShare(serializeWorkspace({ home: 'home', boards: { home: b } }))!.boards.home).toEqual(b);
    const mine = addArrow(b, 'c1', 'n2', 'a2')!;
    const theirs = addArrow(b, 't1', 'n1', 'a3')!;
    expect(mergeBoardSets({ home: b }, { home: mine }, { home: theirs }).home.arrows?.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('an older app (version 4) can’t read version 5 boards, so it never saves over them', () => {
    const text = serializeWorkspace({ home: 'home', boards: { home: addArrow(board(), 'n1', 'n2', 'a1')! } });
    expect(savedByNewer(asVersion(text, 6))).toBe(true);
    expect(readWorkspace(asVersion(text, 6))).toBeNull();
  });

  it('a board with no arrows, saved again as version 5, is the same version in Version history', () => {
    const text = serializeWorkspace({ home: 'home', boards: { home: board() } });
    expect(sameSaved(contentHash(asVersion(text, 4)), text)).toBe(true);
  });
});
