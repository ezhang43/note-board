import { describe, expect, it } from 'vitest';
import { COLOR_KEYS, type ColorKey } from './palette';
import { readBoard, serializeBoard } from './persist';
import type { Block, BlockType, Highlight, Run, RunFont, RunSize } from './richText';
import type { Board, BoardCard, Card, Column, CompletedCard, CompletedEntry, LinkCard, NoteCard, TextStyle, TodoCard, TodoItem } from './types';
import { readWorkspace, serializeWorkspace, WORKSPACE_VERSION } from './workspace';

// Every saved field survives save, load and save again (review pass, job 156). The fixtures are typed
// `Required<...>`, so `npm run typecheck` forces anyone who adds a field to a card, item, container or
// board to add it here too, and this test then fails until persist.ts reads that field back. A field
// that is silently dropped on load is saved over, and synced away, without any error.

const style: Required<TextStyle> = { size: 'large', bold: true, italic: true, font: 'serif' };
const base = { color: 'rose', collapsed: true, w: 300, h: 200, titleColor: 'tomato', collapsedH: 60, style } as const;

const subItem: Required<TodoItem> = { id: 'i2', text: 'sub', done: true, children: [], style };
const item: Required<TodoItem> = { id: 'i1', text: 'top', done: false, children: [subItem], style };

const run: Required<Run> = { text: 'Hi', b: true, i: true, u: true, s: true, size: 'small', font: 'hand', hl: 'yellow' };
const block: Required<Block> = { type: 'bullet', indent: 1, runs: [run] };
const note: Required<NoteCard> = { ...base, id: 'n1', kind: 'note', x: 20, y: 40, text: 'Hi', rich: [block] };
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

// Review 137-A M1 (owner: "m1 yes", job 175). An older copy of the app still open somewhere reads
// boards a newer one saved, drops what it doesn't know, and saves that loss everywhere, unless the
// saved version number went up: then it refuses them ("saved by a newer version of the app") and
// never saves over them. So every change to the saved shape must raise WORKSPACE_VERSION. This test
// fails when the shape (every field name, card kind and allowed value) differs from the one recorded
// for the current number. To fix it: raise WORKSPACE_VERSION in src/model/workspace.ts and add the
// new shape below under the new number. Never edit a shape already recorded (it is published).

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Fails `npm run typecheck` when a list below no longer matches its type. */
const same = <A, B>(ok: Same<A, B>) => ok;
const KINDS = ['board', 'completed', 'link', 'note', 'todo'] as const;
same<Card['kind'], (typeof KINDS)[number]>(true);
const BLOCK_TYPES = ['bullet', 'h1', 'h2', 'number', 'p'] as const;
same<BlockType, (typeof BLOCK_TYPES)[number]>(true);
const SIZES = ['large', 'small'] as const;
same<RunSize, (typeof SIZES)[number]>(true);
same<NonNullable<TextStyle['size']>, (typeof SIZES)[number]>(true);
const FONTS = ['hand', 'mono', 'rounded', 'serif'] as const;
same<RunFont, (typeof FONTS)[number]>(true);
same<NonNullable<TextStyle['font']>, (typeof FONTS)[number]>(true);
const HIGHLIGHTS = ['blue', 'green', 'pink', 'yellow'] as const;
same<Highlight, (typeof HIGHLIGHTS)[number]>(true);
same<ColorKey, (typeof COLOR_KEYS)[number]>(true);
// Every card kind is in the fixture above, so its fields are in the shape.
same<keyof typeof board.cards extends never ? never : (typeof board.cards)[keyof typeof board.cards]['kind'], Card['kind']>(true);

/** The saved shape: each field's path (ids as `*`, a card's as its kind, list entries as `[]`), then the allowed values. */
function shapeOf(raw: string): string[] {
  const paths = new Set<string>();
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) return v.length ? v.forEach((x) => walk(x, `${path}[]`)) : void paths.add(`${path}[]`);
    if (typeof v !== 'object' || v === null) return void paths.add(path);
    const ids = /(^|\.)(boards|cards|columns)$/.test(path);
    for (const [k, x] of Object.entries(v)) {
      const key = !ids ? k : path.endsWith('cards') ? (x as Card).kind : '*';
      walk(x, path ? `${path}.${key}` : key);
    }
  };
  walk(JSON.parse(raw), '');
  const values = { kind: KINDS, color: [...COLOR_KEYS].sort(), 'rich type': BLOCK_TYPES, size: SIZES, font: FONTS, highlight: HIGHLIGHTS };
  return [...[...paths].sort(), ...Object.entries(values).map(([k, v]) => `${k}: ${v.join(' ')}`)];
}

/** The saved shape of each published version number. */
const SAVED_SHAPES: Record<number, string[]> = {
  3: [
    'boards.*.cards.board.boardId',
    'boards.*.cards.board.collapsed',
    'boards.*.cards.board.collapsedH',
    'boards.*.cards.board.color',
    'boards.*.cards.board.h',
    'boards.*.cards.board.id',
    'boards.*.cards.board.kind',
    'boards.*.cards.board.style.bold',
    'boards.*.cards.board.style.font',
    'boards.*.cards.board.style.italic',
    'boards.*.cards.board.style.size',
    'boards.*.cards.board.titleColor',
    'boards.*.cards.board.w',
    'boards.*.cards.board.x',
    'boards.*.cards.board.y',
    'boards.*.cards.completed.collapsed',
    'boards.*.cards.completed.collapsedH',
    'boards.*.cards.completed.color',
    'boards.*.cards.completed.groups[].date',
    'boards.*.cards.completed.groups[].entries[].fromCardId',
    'boards.*.cards.completed.groups[].entries[].fromParentId',
    'boards.*.cards.completed.groups[].entries[].fromTitle',
    'boards.*.cards.completed.groups[].entries[].item.children[]',
    'boards.*.cards.completed.groups[].entries[].item.done',
    'boards.*.cards.completed.groups[].entries[].item.id',
    'boards.*.cards.completed.groups[].entries[].item.style.bold',
    'boards.*.cards.completed.groups[].entries[].item.style.font',
    'boards.*.cards.completed.groups[].entries[].item.style.italic',
    'boards.*.cards.completed.groups[].entries[].item.style.size',
    'boards.*.cards.completed.groups[].entries[].item.text',
    'boards.*.cards.completed.h',
    'boards.*.cards.completed.id',
    'boards.*.cards.completed.kind',
    'boards.*.cards.completed.style.bold',
    'boards.*.cards.completed.style.font',
    'boards.*.cards.completed.style.italic',
    'boards.*.cards.completed.style.size',
    'boards.*.cards.completed.titleColor',
    'boards.*.cards.completed.w',
    'boards.*.cards.completed.x',
    'boards.*.cards.completed.y',
    'boards.*.cards.link.collapsed',
    'boards.*.cards.link.collapsedH',
    'boards.*.cards.link.color',
    'boards.*.cards.link.h',
    'boards.*.cards.link.id',
    'boards.*.cards.link.kind',
    'boards.*.cards.link.style.bold',
    'boards.*.cards.link.style.font',
    'boards.*.cards.link.style.italic',
    'boards.*.cards.link.style.size',
    'boards.*.cards.link.title',
    'boards.*.cards.link.titleColor',
    'boards.*.cards.link.url',
    'boards.*.cards.link.w',
    'boards.*.cards.link.x',
    'boards.*.cards.link.y',
    'boards.*.cards.note.collapsed',
    'boards.*.cards.note.collapsedH',
    'boards.*.cards.note.color',
    'boards.*.cards.note.h',
    'boards.*.cards.note.id',
    'boards.*.cards.note.kind',
    'boards.*.cards.note.rich[].indent',
    'boards.*.cards.note.rich[].runs[].b',
    'boards.*.cards.note.rich[].runs[].font',
    'boards.*.cards.note.rich[].runs[].hl',
    'boards.*.cards.note.rich[].runs[].i',
    'boards.*.cards.note.rich[].runs[].s',
    'boards.*.cards.note.rich[].runs[].size',
    'boards.*.cards.note.rich[].runs[].text',
    'boards.*.cards.note.rich[].runs[].u',
    'boards.*.cards.note.rich[].type',
    'boards.*.cards.note.style.bold',
    'boards.*.cards.note.style.font',
    'boards.*.cards.note.style.italic',
    'boards.*.cards.note.style.size',
    'boards.*.cards.note.text',
    'boards.*.cards.note.titleColor',
    'boards.*.cards.note.w',
    'boards.*.cards.note.x',
    'boards.*.cards.note.y',
    'boards.*.cards.todo.collapsed',
    'boards.*.cards.todo.collapsedH',
    'boards.*.cards.todo.color',
    'boards.*.cards.todo.completedOpen',
    'boards.*.cards.todo.h',
    'boards.*.cards.todo.id',
    'boards.*.cards.todo.items[].children[].children[]',
    'boards.*.cards.todo.items[].children[].done',
    'boards.*.cards.todo.items[].children[].id',
    'boards.*.cards.todo.items[].children[].style.bold',
    'boards.*.cards.todo.items[].children[].style.font',
    'boards.*.cards.todo.items[].children[].style.italic',
    'boards.*.cards.todo.items[].children[].style.size',
    'boards.*.cards.todo.items[].children[].text',
    'boards.*.cards.todo.items[].done',
    'boards.*.cards.todo.items[].id',
    'boards.*.cards.todo.items[].style.bold',
    'boards.*.cards.todo.items[].style.font',
    'boards.*.cards.todo.items[].style.italic',
    'boards.*.cards.todo.items[].style.size',
    'boards.*.cards.todo.items[].text',
    'boards.*.cards.todo.kind',
    'boards.*.cards.todo.style.bold',
    'boards.*.cards.todo.style.font',
    'boards.*.cards.todo.style.italic',
    'boards.*.cards.todo.style.size',
    'boards.*.cards.todo.title',
    'boards.*.cards.todo.titleColor',
    'boards.*.cards.todo.w',
    'boards.*.cards.todo.x',
    'boards.*.cards.todo.y',
    'boards.*.columns.*.cardIds[]',
    'boards.*.columns.*.collapsed',
    'boards.*.columns.*.color',
    'boards.*.columns.*.h',
    'boards.*.columns.*.id',
    'boards.*.columns.*.style.bold',
    'boards.*.columns.*.style.font',
    'boards.*.columns.*.style.italic',
    'boards.*.columns.*.style.size',
    'boards.*.columns.*.title',
    'boards.*.columns.*.w',
    'boards.*.columns.*.x',
    'boards.*.columns.*.y',
    'boards.*.name',
    'boards.*.order[]',
    'boards.*.snap',
    'home',
    'version',
    'kind: board completed link note todo',
    'color: aqua butter coral emerald grass lavender lime magenta mint ocean orchid peach periwinkle rose sage sand sky slate stone sunflower tangerine teal tomato violet',
    'rich type: bullet h1 h2 number p',
    'size: large small',
    'font: hand mono rounded serif',
    'highlight: blue green pink yellow',
  ],
};

describe('the saved version number goes up whenever the saved shape changes (review 137-A M1)', () => {
  it('the shape matches the one recorded for WORKSPACE_VERSION', () => {
    const shape = shapeOf(serializeWorkspace({ home: 'home', boards: { home: board } }));
    expect(shape, 'The saved shape changed: raise WORKSPACE_VERSION and record the new shape under it').toEqual(SAVED_SHAPES[WORKSPACE_VERSION]);
  });

  it('each recorded version has a shape of its own', () => {
    const shapes = Object.values(SAVED_SHAPES).map((s) => JSON.stringify(s));
    expect(new Set(shapes).size).toBe(shapes.length);
  });
});
