import { describe, expect, it } from 'vitest';
import { addCard, addColumn, createBoard } from './board';
import { createBoardCard, createCard, createColumn } from './cards';
import { serializeBoard } from './persist';
import type { Board, NoteCard } from './types';
import {
  HOME_ID,
  WORKSPACE_VERSION,
  asVersion,
  boardLinks,
  boardTree,
  boardNeighbor,
  isLeftoverBoard,
  parseWorkspace,
  pathTo,
  readWorkspace,
  serializeWorkspace,
  withoutBoard,
  type Workspace,
} from './workspace';

// Several boards, and boards inside boards (owner request, 2026-10-05).

const named = (name: string): Board => ({ ...createBoard(), name });
const linkTo = (b: Board, cardId: string, boardId: string, column?: string): Board =>
  addCard(b, createBoardCard(boardId, cardId), column ? { type: 'column', columnId: column, index: 0 } : { type: 'loose', x: 0, y: 0 });

function sample(): Workspace {
  // Home holds a card for Trips (which holds Paris); Recipes stands alone.
  let home = named('Home');
  home = addCard(home, { ...(createCard('note', 'n1') as NoteCard), text: 'hi' }, { type: 'loose', x: 0, y: 0 });
  home = linkTo(home, 'k1', 'trips');
  return {
    home: 'h',
    boards: { h: home, trips: linkTo(named('Trips'), 'k2', 'paris'), paris: named('Paris'), recipes: named('Recipes') },
  };
}

describe('saving several boards', () => {
  it('reads back exactly what it wrote', () => {
    const ws = sample();
    expect(readWorkspace(serializeWorkspace(ws))).toEqual({ ws, legacy: false });
  });

  it('a board saved before there were several boards becomes the home board', () => {
    const board = addCard(named('Mine'), createCard('todo', 't1'), { type: 'loose', x: 0, y: 0 });
    expect(readWorkspace(serializeBoard(board))).toEqual({ ws: { home: HOME_ID, boards: { [HOME_ID]: board } }, legacy: true });
  });

  it('asVersion gives the same saved text with only the version number changed, wherever the number sits', () => {
    const data = serializeWorkspace(sample());
    expect(asVersion(data, 3)).toBe(data.replace(`"version":${WORKSPACE_VERSION},`, '"version":3,'));
    expect(asVersion(data, WORKSPACE_VERSION)).toBe(data);
    // Not found by its place in the text (a change of field order can't silently break it).
    expect(asVersion('{"home":"h","version":4,"boards":{}}', 3)).toBe('{"home":"h","version":3,"boards":{}}');
  });

  it('damaged data or data from a newer version can’t be read (null); parseWorkspace then starts fresh', () => {
    for (const raw of ['nope', '{}', '{"version":99,"boards":{}}', '{"version":3,"home":"h","boards":{}}', '{"version":3,"home":"h"}']) {
      expect(readWorkspace(raw)).toBeNull();
    }
    expect(parseWorkspace(null)).toEqual({ home: HOME_ID, boards: { [HOME_ID]: createBoard() } });
  });

  it('a missing home board falls back to the first board; unreadable boards are dropped', () => {
    const raw = JSON.stringify({ version: 3, home: 'gone', boards: { a: { name: 'A' }, b: 7 } });
    const got = readWorkspace(raw)!.ws;
    expect(got.home).toBe('a');
    expect(Object.keys(got.boards)).toEqual(['a']);
    expect(got.boards.a.name).toBe('A');
  });

  it('a board card is saved and read back with the board it opens', () => {
    const ws = sample();
    const back = readWorkspace(serializeWorkspace(ws))!.ws;
    expect(back.boards.h.cards.k1).toEqual({ ...createBoardCard('trips', 'k1') });
  });
});

describe('finding boards', () => {
  it('lists the boards a board opens, in board order (columns too)', () => {
    let b = addColumn(named('B'), { ...createColumn('c1'), x: 0, y: 0 });
    b = linkTo(b, 'k1', 'x');
    b = linkTo(b, 'k2', 'y', 'c1');
    expect(boardLinks(b)).toEqual(['y', 'x']);
  });

  it('the board list: home first, then boards inside it (indented), then boards not inside any other', () => {
    expect(boardTree(sample())).toEqual([
      { id: 'h', depth: 0 },
      { id: 'trips', depth: 1 },
      { id: 'paris', depth: 2 },
      { id: 'recipes', depth: 0 },
    ]);
  });

  it('a board that opens one of its own parents is still listed once', () => {
    const ws = sample();
    ws.boards.paris = linkTo(ws.boards.paris, 'k3', 'h');
    expect(boardTree(ws).map((r) => r.id)).toEqual(['h', 'trips', 'paris', 'recipes']);
  });

  it('the path to a board, from the top (for going back up)', () => {
    const ws = sample();
    expect(pathTo(ws, 'paris')).toEqual(['h', 'trips', 'paris']);
    expect(pathTo(ws, 'h')).toEqual(['h']);
    expect(pathTo(ws, 'recipes')).toEqual(['recipes']);
  });
});

describe('Ctrl+arrow board switching (owner request, 2026-10-16)', () => {
  // Menu order: h, trips (inside h), paris (inside trips), oslo (inside h, after trips), recipes.
  const ws = (): Workspace => {
    const s = sample();
    s.boards.h = linkTo(s.boards.h, 'k3', 'oslo');
    s.boards.oslo = named('Oslo');
    return s;
  };

  it('next / previous follow the Boards menu order, sub-boards included', () => {
    const w = ws();
    expect(boardTree(w).map((r) => r.id)).toEqual(['h', 'trips', 'paris', 'oslo', 'recipes']);
    expect(boardNeighbor(w, 'h', 'next')).toBe('trips');
    expect(boardNeighbor(w, 'trips', 'next')).toBe('paris');
    expect(boardNeighbor(w, 'paris', 'next')).toBe('oslo');
    expect(boardNeighbor(w, 'oslo', 'next')).toBe('recipes');
    expect(boardNeighbor(w, 'recipes', 'previous')).toBe('oslo');
    expect(boardNeighbor(w, 'oslo', 'previous')).toBe('paris');
  });

  it('nothing past either end (no wrap)', () => {
    const w = ws();
    expect(boardNeighbor(w, 'recipes', 'next')).toBeNull();
    expect(boardNeighbor(w, 'h', 'previous')).toBeNull();
  });

  it('up goes to the board above; a top board has none', () => {
    const w = ws();
    expect(boardNeighbor(w, 'paris', 'up')).toBe('trips');
    expect(boardNeighbor(w, 'oslo', 'up')).toBe('h');
    expect(boardNeighbor(w, 'h', 'up')).toBeNull();
    expect(boardNeighbor(w, 'recipes', 'up')).toBeNull();
  });

  it('down goes into the first sub-board; a board with none has no way down', () => {
    const w = ws();
    expect(boardNeighbor(w, 'h', 'down')).toBe('trips');
    expect(boardNeighbor(w, 'trips', 'down')).toBe('paris');
    expect(boardNeighbor(w, 'paris', 'down')).toBeNull();
    expect(boardNeighbor(w, 'recipes', 'down')).toBeNull();
  });

  it('a board that is not there has no neighbor', () => {
    expect(boardNeighbor(ws(), 'gone', 'next')).toBeNull();
  });
});

describe('removing boards', () => {
  it('deleting a board removes it and every card that opens it, wherever they are', () => {
    let ws = sample();
    ws.boards.recipes = addColumn(ws.boards.recipes, { ...createColumn('c9'), x: 0, y: 0 });
    ws.boards.recipes = linkTo(ws.boards.recipes, 'k9', 'trips', 'c9');
    ws = withoutBoard(ws, 'trips');
    expect(ws.boards.trips).toBeUndefined();
    expect(ws.boards.h.cards.k1).toBeUndefined();
    expect(ws.boards.h.order).not.toContain('k1');
    expect(ws.boards.recipes.columns.c9.cardIds).toEqual([]);
    // Boards inside it are kept: they now stand alone.
    expect(ws.boards.paris).toBeDefined();
    expect(boardTree(ws).map((r) => r.id)).toEqual(['h', 'paris', 'recipes']);
  });

  it('the home board is never deleted', () => {
    const ws = sample();
    expect(withoutBoard(ws, 'h')).toBe(ws);
  });

  it('a new board left empty and unnamed, that no card opens, is a leftover (dropped on leaving it)', () => {
    const ws = sample();
    ws.boards.blank = { ...createBoard(), name: '' };
    expect(isLeftoverBoard(ws, 'blank')).toBe(true);
    expect(isLeftoverBoard({ ...ws, boards: { ...ws.boards, blank: { ...ws.boards.blank, name: 'Named' } } }, 'blank')).toBe(false);
    expect(isLeftoverBoard(ws, 'paris')).toBe(false); // empty, but a card opens it
    expect(isLeftoverBoard({ ...ws, boards: { ...ws.boards, h: { ...createBoard(), name: '' } } }, 'h')).toBe(false); // home
  });
});
