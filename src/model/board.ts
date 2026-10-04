import { pruneArrows } from './arrows';
import { isPermanent } from './cards';
import { CARD_MAX_W, CARD_MIN_W, CARD_W, COLUMN_MAX_W, COLUMN_MIN_W, DEFAULT_BOARD_NAME } from './constants';
import { AUTO_COLOUR_ORDER, type ColorKey } from './palette';
import type { Board, Card, Column, Point, TodoItem } from './types';

// Every function here takes a board and returns a new one (or the same one when nothing changes).
// None of them change the board they are given.

export function createBoard(): Board {
  return { name: DEFAULT_BOARD_NAME, snap: true, cards: {}, columns: {}, order: [] };
}

export function renameBoard(board: Board, name: string): Board {
  return name === board.name ? board : { ...board, name };
}

export function setSnap(board: Board, snap: boolean): Board {
  return snap === board.snap ? board : { ...board, snap };
}

/** Where a card goes: loose on the board at x,y, or into a column at a position (0 = top). */
export type Placement = { type: 'loose'; x: number; y: number } | { type: 'column'; columnId: string; index: number };

export function columnOf(board: Board, cardId: string): Column | null {
  for (const id of board.order) {
    const col = board.columns[id];
    if (col && col.cardIds.includes(cardId)) return col;
  }
  return null;
}

/** The card or column with this id. */
export function blockOf(board: Board, id: string): Card | Column | undefined {
  return board.columns[id] ?? board.cards[id];
}

/** The block on the board itself for this id: the column a card is in, or the block itself. */
export function topLevelOf(board: Board, id: string): string {
  return columnOf(board, id)?.id ?? id;
}

/** Take a card out of wherever it is (the loose layer or its column), keeping the card itself. */
function detach(board: Board, cardId: string): Board {
  const col = columnOf(board, cardId);
  if (col) {
    return { ...board, columns: { ...board.columns, [col.id]: { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) } } };
  }
  return { ...board, order: board.order.filter((id) => id !== cardId) };
}

function attach(board: Board, cardId: string, place: Placement): Board {
  const card = board.cards[cardId];
  if (place.type === 'loose') {
    return {
      ...board,
      cards: { ...board.cards, [cardId]: { ...card, x: place.x, y: place.y } },
      order: [...board.order, cardId],
    };
  }
  const col = board.columns[place.columnId];
  const cardIds = [...col.cardIds];
  cardIds.splice(Math.max(0, Math.min(place.index, cardIds.length)), 0, cardId);
  // Dropping into a collapsed column opens it.
  return { ...board, columns: { ...board.columns, [col.id]: { ...col, cardIds, collapsed: false } } };
}

export function addCard(board: Board, card: Card, place: Placement): Board {
  if (place.type === 'column' && !board.columns[place.columnId]) return board;
  return attach({ ...board, cards: { ...board.cards, [card.id]: card } }, card.id, place);
}

export function addColumn(board: Board, column: Column): Board {
  return { ...board, columns: { ...board.columns, [column.id]: column }, order: [...board.order, column.id] };
}

/** Move a card to a new place. A card moved on the board comes to the front. */
export function moveCard(board: Board, cardId: string, place: Placement): Board {
  if (!board.cards[cardId]) return board;
  if (place.type === 'column' && !board.columns[place.columnId]) return board;
  return attach(detach(board, cardId), cardId, place);
}

/** Move a column (its cards go with it) and bring it to the front. */
export function moveColumn(board: Board, columnId: string, x: number, y: number): Board {
  const col = board.columns[columnId];
  if (!col) return board;
  return {
    ...board,
    columns: { ...board.columns, [columnId]: { ...col, x, y } },
    order: [...board.order.filter((id) => id !== columnId), columnId],
  };
}

export function updateCard(board: Board, cardId: string, change: (card: Card) => Card): Board {
  const card = board.cards[cardId];
  if (!card) return board;
  const next = change(card);
  return next === card ? board : { ...board, cards: { ...board.cards, [cardId]: next } };
}

export function updateColumn(board: Board, columnId: string, change: Partial<Pick<Column, 'title' | 'collapsed'>>): Board {
  const col = board.columns[columnId];
  if (!col) return board;
  return { ...board, columns: { ...board.columns, [columnId]: { ...col, ...change } } };
}

/**
 * Set a loose card's width and minimum height (from resizing); `h` left out keeps the height (right
 * edge: width only). A collapsed card keeps its own height (`collapsedH`), apart from its open one.
 */
export function resizeCard(board: Board, cardId: string, w: number, h?: number | null): Board {
  return updateCard(board, cardId, (c) => {
    if (c.collapsed) {
      const collapsedH = h === undefined ? c.collapsedH : h;
      return c.w === w && c.collapsedH === collapsedH ? c : { ...c, w, collapsedH };
    }
    const nextH = h === undefined ? c.h : h;
    return c.w === w && c.h === nextH ? c : { ...c, w, h: nextH };
  });
}

/** Set a column's width, and its minimum height unless `h` is undefined (edge strip: width only). */
export function resizeColumn(board: Board, columnId: string, w: number, h?: number): Board {
  const col = board.columns[columnId];
  if (!col) return board;
  const next = { ...col, w, h: h === undefined ? col.h : h };
  return next.w === col.w && next.h === col.h ? board : { ...board, columns: { ...board.columns, [columnId]: next } };
}

/** These blocks, with the cards inside any of them that are columns. */
function withColumnCards(board: Board, ids: string[]): string[] {
  return ids.flatMap((id) => [id, ...(board.columns[id]?.cardIds ?? [])]);
}

/** True if any card or column is open (not collapsed); of `ids` (and their cards) only, if given. */
export function anyExpanded(board: Board, ids?: string[]): boolean {
  if (ids) return withColumnCards(board, ids).some((id) => blockOf(board, id)?.collapsed === false);
  return Object.values(board.cards).some((c) => !c.collapsed) || Object.values(board.columns).some((c) => !c.collapsed);
}

/** Collapse (or expand) these blocks; a column takes its cards with it (owner request: Collapse all on a selection). */
export function setCollapsedFor(board: Board, ids: string[], collapsed: boolean): Board {
  const all = new Set(withColumnCards(board, ids));
  const cards = Object.fromEntries(Object.entries(board.cards).map(([id, c]) => [id, all.has(id) && c.collapsed !== collapsed ? { ...c, collapsed } : c]));
  const columns = Object.fromEntries(Object.entries(board.columns).map(([id, c]) => [id, all.has(id) && c.collapsed !== collapsed ? { ...c, collapsed } : c]));
  return { ...board, cards, columns };
}

/** Collapse (or expand) every card and column on the board. */
export function setAllCollapsed(board: Board, collapsed: boolean): Board {
  const blocks = [...Object.values(board.cards), ...Object.values(board.columns)];
  if (blocks.every((b) => b.collapsed === collapsed)) return board;
  const cards = Object.fromEntries(Object.entries(board.cards).map(([id, c]) => [id, c.collapsed === collapsed ? c : { ...c, collapsed }]));
  const columns = Object.fromEntries(Object.entries(board.columns).map(([id, c]) => [id, c.collapsed === collapsed ? c : { ...c, collapsed }]));
  return { ...board, cards, columns };
}

/** Where the loose blocks and columns are. */
export interface LayoutSnapshot {
  at: Record<string, Point>;
}

export function layoutSnapshot(board: Board): LayoutSnapshot {
  return {
    at: Object.fromEntries(board.order.map((id) => [id, { x: blockOf(board, id)!.x, y: blockOf(board, id)!.y }])),
  };
}

/**
 * Expand all after Collapse all (owner request): every block opens (even ones that were collapsed
 * before; only `ids` and their cards, if given), and blocks still where Collapse all left them
 * (`after`) go back to where they were (`before`). Blocks moved in between stay put.
 */
export function restoreLayout(board: Board, before: LayoutSnapshot, after: LayoutSnapshot, ids?: string[]): Board {
  const opening = ids && new Set(withColumnCards(board, ids));
  const place = <T extends Card | Column>(b: T): T => {
    const collapsed = opening && !opening.has(b.id) ? b.collapsed : false;
    const was = before.at[b.id];
    const left = after.at[b.id];
    const unmoved = was && left && b.x === left.x && b.y === left.y && board.order.includes(b.id);
    const next = unmoved ? { ...b, collapsed, x: was.x, y: was.y } : { ...b, collapsed };
    return next.collapsed === b.collapsed && next.x === b.x && next.y === b.y ? b : next;
  };
  const cards = Object.fromEntries(Object.entries(board.cards).map(([id, c]) => [id, place(c)]));
  const columns = Object.fromEntries(Object.entries(board.columns).map(([id, c]) => [id, place(c)]));
  return { ...board, cards, columns };
}

/**
 * Same width (owner request): every selected loose card and column takes the width of the first
 * one of them, kept within its own kind's limits. Cards inside columns follow their column.
 */
export function matchWidths(board: Board, ids: string[]): Board {
  const top = ids.filter((id) => board.order.includes(id));
  if (top.length < 2) return board;
  const first = blockOf(board, top[0])!;
  const w = board.columns[top[0]] ? (first as Column).w : ((first as Card).w ?? CARD_W);
  let next = board;
  for (const id of top.slice(1)) {
    if (next.columns[id]) next = resizeColumn(next, id, Math.min(COLUMN_MAX_W, Math.max(COLUMN_MIN_W, w)));
    else next = resizeCard(next, id, Math.min(CARD_MAX_W, Math.max(CARD_MIN_W, w)));
  }
  return next;
}

export function toggleCollapsed(board: Board, id: string): Board {
  if (board.columns[id]) return updateColumn(board, id, { collapsed: !board.columns[id].collapsed });
  return updateCard(board, id, (c) => ({ ...c, collapsed: !c.collapsed }));
}

/** Deletes a card. The Completed card is never deleted (owner's rule). */
export function deleteCard(board: Board, cardId: string): Board {
  if (!board.cards[cardId] || isPermanent(board.cards[cardId])) return board;
  const detached = detach(board, cardId);
  const cards = { ...detached.cards };
  delete cards[cardId];
  return pruneArrows({ ...detached, cards });
}

/** Deletes a column and every card in it, except the Completed card, which is left loose where the column was. */
export function deleteColumn(board: Board, columnId: string): Board {
  const col = board.columns[columnId];
  if (!col) return board;
  const cards = { ...board.cards };
  const kept = col.cardIds.filter((id) => cards[id] && isPermanent(cards[id]));
  for (const id of col.cardIds) if (!kept.includes(id)) delete cards[id];
  for (const id of kept) cards[id] = { ...cards[id], x: col.x, y: col.y };
  const columns = { ...board.columns };
  delete columns[columnId];
  return pruneArrows({ ...board, cards, columns, order: [...board.order.filter((id) => id !== columnId), ...kept] });
}

/** Deletes every listed card and column (columns go with their cards). */
export function deleteBlocks(board: Board, ids: string[]): Board {
  let next = board;
  for (const id of ids) next = next.columns[id] ? deleteColumn(next, id) : deleteCard(next, id);
  return next;
}

/** Moves every listed top-level block (loose cards and columns) by dx, dy, bringing them to the front. */
export function moveBlocksBy(board: Board, ids: string[], dx: number, dy: number): Board {
  const top = ids.filter((id) => board.order.includes(id));
  if (!top.length || (dx === 0 && dy === 0)) return board;
  const cards = { ...board.cards };
  const columns = { ...board.columns };
  for (const id of top) {
    if (columns[id]) columns[id] = { ...columns[id], x: columns[id].x + dx, y: columns[id].y + dy };
    else cards[id] = { ...cards[id], x: cards[id].x + dx, y: cards[id].y + dy };
  }
  return { ...board, cards, columns, order: [...board.order.filter((id) => !top.includes(id)), ...top] };
}

/** Moves a card inside a column one place up (-1) or down (1). Same board at either end or when loose. */
export function shiftInColumn(board: Board, cardId: string, step: -1 | 1): Board {
  const col = columnOf(board, cardId);
  if (!col) return board;
  const index = col.cardIds.indexOf(cardId) + step;
  if (index < 0 || index >= col.cardIds.length) return board;
  return moveCard(board, cardId, { type: 'column', columnId: col.id, index });
}

/**
 * Colour button: listed columns get the colour; listed cards (always white) get it on their title
 * band. null puts them back to normal (stone-grey column, usual band).
 */
export function recolour(board: Board, ids: string[], color: ColorKey | null): Board {
  let next = board;
  for (const id of ids) {
    const col = next.columns[id];
    if (col && col.color !== color) next = { ...next, columns: { ...next.columns, [id]: { ...col, color } } };
    else if (!col) next = updateCard(next, id, (c) => ((c.titleColor ?? null) === color ? c : { ...c, titleColor: color }));
  }
  return next;
}

/**
 * Auto-colour: every column gets a different colour. Columns are taken left to right (top to
 * bottom where they start at the same x), and colours are handed out in AUTO_COLOUR_ORDER, so
 * no two columns share a colour until there are more than 16.
 */
export function autoColour(board: Board): Board {
  const cols = Object.values(board.columns).sort((a, b) => a.x - b.x || a.y - b.y);
  let next = board;
  cols.forEach((col, i) => {
    const color = AUTO_COLOUR_ORDER[i % AUTO_COLOUR_ORDER.length];
    if (col.color !== color) next = { ...next, columns: { ...next.columns, [col.id]: { ...col, color } } };
  });
  return next;
}

/**
 * Where a newly added card should go, given the selected block:
 * a selected column gets it at the end; a selected card inside a column gets it directly below;
 * otherwise null (the card goes loose on the board).
 */
export function placementForNewCard(board: Board, selectedId: string | null): Placement | null {
  if (!selectedId) return null;
  const col = board.columns[selectedId];
  if (col) return { type: 'column', columnId: col.id, index: col.cardIds.length };
  const parent = columnOf(board, selectedId);
  if (parent) return { type: 'column', columnId: parent.id, index: parent.cardIds.indexOf(selectedId) + 1 };
  return null;
}

// ---------- checklist items (full checklist editing comes in step 5) ----------

function mapItems(items: TodoItem[], itemId: string, change: (it: TodoItem) => TodoItem): TodoItem[] {
  let changed = false;
  const out = items.map((it) => {
    if (it.id === itemId) {
      changed = true;
      return change(it);
    }
    const children = mapItems(it.children, itemId, change);
    if (children !== it.children) {
      changed = true;
      return { ...it, children };
    }
    return it;
  });
  return changed ? out : items;
}

function updateItem(board: Board, cardId: string, itemId: string, change: (it: TodoItem) => TodoItem): Board {
  return updateCard(board, cardId, (card) => {
    if (card.kind !== 'todo') return card;
    const items = mapItems(card.items, itemId, change);
    return items === card.items ? card : { ...card, items };
  });
}

export function setItemText(board: Board, cardId: string, itemId: string, text: string): Board {
  return updateItem(board, cardId, itemId, (it) => (it.text === text ? it : { ...it, text }));
}

// ---------- reading ----------

/**
 * Problems with the "every card in exactly one place" rule. Empty when the board is healthy.
 * Used by tests and when loading saved data.
 */
export function problems(board: Board): string[] {
  const out: string[] = [];
  const seen = new Map<string, number>();
  const count = (id: string) => seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const id of board.order) {
    if (board.columns[id]) {
      for (const cid of board.columns[id].cardIds) {
        if (!board.cards[cid]) out.push(`column ${id} lists missing card ${cid}`);
        count(cid);
      }
    } else if (board.cards[id]) count(id);
    else out.push(`order lists unknown block ${id}`);
  }
  for (const id of Object.keys(board.columns)) if (!board.order.includes(id)) out.push(`column ${id} is not on the board`);
  for (const id of Object.keys(board.cards)) {
    const n = seen.get(id) ?? 0;
    if (n !== 1) out.push(`card ${id} is in ${n} places`);
  }
  return out;
}
