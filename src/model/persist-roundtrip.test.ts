import { describe, expect, it } from 'vitest';
import { readBoard, serializeBoard } from './persist';
import { fromPlain } from './richText';
import type { Board, BoardCard, Column, CompletedCard, CompletedEntry, LinkCard, NoteCard, TextStyle, TodoCard, TodoItem } from './types';
import { readWorkspace, serializeWorkspace } from './workspace';

// Every saved field survives save, load and save again (review pass, job 156). The fixtures are typed
// `Required<...>`, so `npm run typecheck` forces anyone who adds a field to a card, item, container or
// board to add it here too, and this test then fails until persist.ts reads that field back. A field
// that is silently dropped on load is saved over, and synced away, without any error.

const style: Required<TextStyle> = { size: 'large', bold: true, italic: true, font: 'serif' };
const base = { color: 'rose', collapsed: true, w: 300, h: 200, titleColor: 'tomato', collapsedH: 60, style } as const;

const subItem: Required<TodoItem> = { id: 'i2', text: 'sub', done: true, children: [], style };
const item: Required<TodoItem> = { id: 'i1', text: 'top', done: false, children: [subItem], style };

const note: Required<NoteCard> = { ...base, id: 'n1', kind: 'note', x: 20, y: 40, text: 'Hi', rich: fromPlain('Hi') };
const todo: Required<TodoCard> = { ...base, id: 't1', kind: 'todo', x: 400, y: 80, title: 'List', items: [item], completedOpen: true };
const link: Required<LinkCard> = { ...base, id: 'l1', kind: 'link', x: 400, y: 400, title: 'Docs', url: 'https://example.com' };
const entry: Required<CompletedEntry> = { item: { ...subItem, id: 'i9' }, fromCardId: 't1', fromTitle: 'List', fromParentId: 'i1' };
const completed: Required<CompletedCard> = { ...base, id: 'k1', kind: 'completed', x: 800, y: 0, groups: [{ date: '2026-10-20', entries: [entry] }] };
const boardCard: Required<BoardCard> = { ...base, id: 'b1', kind: 'board', x: 800, y: 300, boardId: 'sub' };
const column: Required<Column> = { id: 'c1', title: 'Col', x: 0, y: 500, w: 360, h: 500, color: 'ocean', collapsed: true, cardIds: ['n1'], style };

const board: Required<Board> = {
  name: 'Everything',
  snap: false,
  cards: { n1: note, t1: todo, l1: link, k1: completed, b1: boardCard },
  columns: { c1: column },
  order: ['c1', 't1', 'l1', 'k1', 'b1'],
};

describe('save, load, save again', () => {
  it('a board with every field set comes back exactly as it went out', () => {
    const text = serializeBoard(board);
    const back = readBoard(text);
    expect(back).not.toBeNull();
    // Compare the saved JSON, not the objects: toEqual treats a missing field and undefined as the same.
    expect(JSON.parse(serializeBoard(back!))).toEqual(JSON.parse(text));
  });

  it('a workspace of two boards comes back exactly as it went out', () => {
    const text = serializeWorkspace({ home: 'home', boards: { home: board, other: { ...board, name: 'Second', snap: true } } });
    const back = readWorkspace(text);
    expect(back).not.toBeNull();
    expect(JSON.parse(serializeWorkspace(back!.ws))).toEqual(JSON.parse(text));
  });
});
