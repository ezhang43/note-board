import { createBoard } from './board';
import { COLUMN_W } from './constants';
import { isColorKey } from './palette';
import { parseStyle } from './textStyle';
import { clampZoom, createView } from './view';
import type { Board, Card, Column, CompletedGroup, TodoItem, View } from './types';
import { DEFAULT_COLOR } from './cards';
import { isDueDate } from './due';
import { readArrows } from './arrows';

export const BOARD_KEY = 'note-board:v1';
export const VIEW_KEY = 'note-board:view:v1';
/** Bump when the saved shape changes, and teach parseBoard to read the old shape. */
export const BOARD_VERSION = 2;

/** The part of localStorage we use; lets tests pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function serializeBoard(board: Board): string {
  return JSON.stringify({ version: BOARD_VERSION, board });
}

function parseJson(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

type Obj = Record<string, unknown>;

function isObject(x: unknown): x is Obj {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
/** A saved text format, to spread in: nothing when missing or unreadable. */
const styleField = (v: unknown) => {
  const style = parseStyle(v);
  return style ? { style } : {};
};
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
/** A resized width/height, or null for "not resized" (also for anything unreadable). */
const size = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

function parseItems(v: unknown, depth = 0): TodoItem[] {
  if (!Array.isArray(v) || depth > 10) return [];
  return v.filter(isObject).flatMap((it) =>
    typeof it.id === 'string'
      ? [{ id: it.id, text: str(it.text, ''), done: bool(it.done, false), children: parseItems(it.children, depth + 1), ...styleField(it.style), ...(isDueDate(it.due) ? { due: it.due } : {}) }]
      : [],
  );
}

/** The Completed card's day groups. Entries without a readable item are dropped. */
function parseGroups(v: unknown): CompletedGroup[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObject).flatMap((g) => {
    if (typeof g.date !== 'string' || !Array.isArray(g.entries)) return [];
    const entries = g.entries.filter(isObject).flatMap((e) => {
      const [item] = parseItems([e.item]);
      if (!item) return [];
      const fromParentId = typeof e.fromParentId === 'string' ? e.fromParentId : null;
      return [{ item, fromCardId: str(e.fromCardId, ''), fromTitle: str(e.fromTitle, ''), fromParentId }];
    });
    return entries.length ? [{ date: g.date, entries }] : [];
  });
}

function parseCard(id: string, c: unknown): Card | null {
  if (!isObject(c)) return null;
  const kind = c.kind;
  if (kind !== 'note' && kind !== 'todo' && kind !== 'link' && kind !== 'completed' && kind !== 'board') return null;
  if (kind === 'board' && typeof c.boardId !== 'string') return null;
  const base = {
    id,
    color: isColorKey(c.color) ? c.color : kind === 'completed' || kind === 'board' ? 'stone' : DEFAULT_COLOR[kind],
    collapsed: bool(c.collapsed, false),
    x: num(c.x, 0),
    y: num(c.y, 0),
    w: size(c.w),
    h: size(c.h),
    ...(isColorKey(c.titleColor) ? { titleColor: c.titleColor } : {}),
    ...(size(c.collapsedH) ? { collapsedH: size(c.collapsedH) } : {}),
    ...styleField(c.style),
  };
  if (kind === 'note') return { ...base, kind, text: str(c.text, '') };
  if (kind === 'link') return { ...base, kind, title: str(c.title, ''), url: str(c.url, '') };
  if (kind === 'completed') return { ...base, kind, groups: parseGroups(c.groups) };
  if (kind === 'board') return { ...base, kind, boardId: c.boardId as string };
  const items = parseItems(c.items);
  return {
    ...base,
    kind,
    title: str(c.title, ''),
    // A list always has at least one item to type in.
    items: items.length ? items : [{ id: `${id}_i0`, text: '', done: false, children: [] }],
    completedOpen: bool(c.completedOpen, true),
  };
}

function parseColumn(id: string, c: unknown): Column | null {
  if (!isObject(c)) return null;
  return {
    id,
    title: str(c.title, ''),
    x: num(c.x, 0),
    y: num(c.y, 0),
    w: num(c.w, COLUMN_W),
    h: size(c.h),
    color: isColorKey(c.color) ? c.color : null,
    collapsed: bool(c.collapsed, false),
    cardIds: Array.isArray(c.cardIds) ? c.cardIds.filter((x): x is string => typeof x === 'string') : [],
    ...styleField(c.style),
  };
}

/**
 * Rebuilds a board from saved data so that every card ends up in exactly one place.
 * Anything unreadable is dropped; a card that isn't placed anywhere is put back on the board.
 */
function parseBlocks(b: Obj): Pick<Board, 'cards' | 'columns' | 'order'> {
  const cards: Record<string, Card> = {};
  const columns: Record<string, Column> = {};
  if (isObject(b.cards)) {
    for (const [id, c] of Object.entries(b.cards)) {
      const card = parseCard(id, c);
      if (card) cards[id] = card;
    }
  }
  if (isObject(b.columns)) {
    for (const [id, c] of Object.entries(b.columns)) {
      if (id in cards) continue;
      const col = parseColumn(id, c);
      if (col) columns[id] = col;
    }
  }

  const placed = new Set<string>();
  const order: string[] = [];
  const savedOrder = Array.isArray(b.order) ? b.order.filter((x): x is string => typeof x === 'string') : [];
  const place = (id: string) => {
    if (placed.has(id)) return;
    if (columns[id]) {
      placed.add(id);
      order.push(id);
      columns[id] = {
        ...columns[id],
        cardIds: columns[id].cardIds.filter((cid) => {
          if (!cards[cid] || placed.has(cid)) return false;
          placed.add(cid);
          return true;
        }),
      };
    } else if (cards[id]) {
      placed.add(id);
      order.push(id);
    }
  };
  savedOrder.forEach(place);
  Object.keys(columns).forEach(place);
  Object.keys(cards).forEach(place);
  return { cards, columns, order };
}

/**
 * Reads saved board data, or null when it can't be read at all (damaged, or saved by a newer
 * version of the app). Within a readable board, anything damaged falls back to its default.
 */
export function readBoard(raw: string | null): Board | null {
  const data = parseJson(raw);
  if (!isObject(data) || !isObject(data.board)) return null;
  return readBoardData(data.version, data.board);
}

/** One saved board (`b`, as saved under `version`), or null when that version can't be read. */
export function readBoardData(version: unknown, b: unknown): Board | null {
  const fresh = createBoard();
  if (!isObject(b)) return null;
  const basics = { name: str(b.name, fresh.name), snap: bool(b.snap, fresh.snap) };
  // Version 1 (step 1) only had the name and snap setting.
  if (version === 1) return { ...fresh, ...basics };
  if (version !== BOARD_VERSION) return null;
  const board: Board = { ...basics, ...parseBlocks(b) };
  const arrows = readArrows(b.arrows, board);
  return arrows ? { ...board, arrows } : board;
}

/** Reads saved board data; anything unreadable gives a fresh board. */
export function parseBoard(raw: string | null): Board {
  return readBoard(raw) ?? createBoard();
}

/** Only pan and zoom are remembered; the tool always starts as Hand. */
export function serializeView(view: View): string {
  return JSON.stringify({ panX: view.panX, panY: view.panY, zoom: view.zoom });
}

export function parseView(raw: string | null): View {
  const fresh = createView();
  const data = parseJson(raw);
  if (!isObject(data)) return fresh;
  return {
    ...fresh,
    panX: num(data.panX, fresh.panX),
    panY: num(data.panY, fresh.panY),
    zoom: clampZoom(num(data.zoom, fresh.zoom)),
  };
}
