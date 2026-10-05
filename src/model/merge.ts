import type { Arrow, Board, Card, Column, TodoCard, TodoItem } from './types';

// Combining two people's edits to a board (real-time collaboration, owner request 2026-10-05).
// `base` is the board both started from, `mine` this page's board, `theirs` the one someone else
// saved. Changes to different things (cards, fields of a card, checklist items, arrows) are all
// kept. When both changed the very same thing, mine wins: it is the later change, since this page
// sends the combined board straight after. A thing deleted on one side but edited on the other is
// kept, so nothing typed is lost. The result always keeps the board's rules: every card in exactly
// one place, every item in one list, no arrow to a missing block.

type Obj = Record<string, unknown>;

/** Same content (keys holding `undefined` count as missing). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ao = a as Obj;
  const bo = b as Obj;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!deepEqual(ao[k], bo[k])) return false;
  return true;
}

/** One value: whichever side changed it; mine when both did. */
function pick<T>(b: T | undefined, m: T | undefined, t: T | undefined): T | undefined {
  if (deepEqual(m, b)) return t;
  return m;
}

/** Field by field, leaving out `skip` (combined separately). */
function mergeFields<T extends object>(b: T | undefined, m: T, t: T, skip: string[] = []): T {
  const bo = b as Obj | undefined;
  const mo = m as Obj;
  const to = t as Obj;
  const out: Obj = {};
  for (const k of new Set([...Object.keys(mo), ...Object.keys(to)])) {
    if (skip.includes(k)) continue;
    const v = pick(bo?.[k], mo[k], to[k]);
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/**
 * Which things survive, each combined with `mergeOne`. Deleted on one side: gone, unless the other
 * side changed it (`changed`), then kept as that side has it.
 */
function mergeEntities<E>(
  b: Record<string, E>,
  m: Record<string, E>,
  t: Record<string, E>,
  mergeOne: (b: E | undefined, m: E, t: E) => E,
  changed: (was: E, now: E) => boolean = (was, now) => !deepEqual(was, now),
): Record<string, E> {
  const out: Record<string, E> = {};
  for (const id of new Set([...Object.keys(m), ...Object.keys(t)])) {
    const inB = id in b;
    if (id in m && id in t) out[id] = mergeOne(inB ? b[id] : undefined, m[id], t[id]);
    else if (id in m) {
      if (!inB || changed(b[id], m[id])) out[id] = m[id];
    } else if (!inB || changed(b[id], t[id])) out[id] = t[id];
  }
  return out;
}

/**
 * The order of one list: theirs if they reordered it, else mine; then anything placed in it that
 * isn't there yet goes just after whatever came before it in mine (or theirs).
 */
function orderList(b: string[], m: string[], t: string[], members: Set<string>): string[] {
  const seq = deepEqual(t, b) ? m : t;
  const out: string[] = [];
  for (const id of seq) if (members.has(id) && !out.includes(id)) out.push(id);
  const rest = [...m, ...t, ...members].filter((id, i, all) => members.has(id) && !out.includes(id) && all.indexOf(id) === i);
  for (const id of rest) {
    let at = -1;
    for (const src of [m, t]) {
      const i = src.indexOf(id);
      if (i < 0) continue;
      for (let j = i - 1; j >= 0 && at < 0; j--) {
        const k = out.indexOf(src[j]);
        if (k >= 0) at = k + 1;
      }
      if (at < 0) at = 0;
      break;
    }
    if (at < 0) out.push(id);
    else out.splice(at, 0, id);
  }
  return out;
}

/** Every list of a version (name → ids) and where each thing in them sits (id → list name). */
interface Lists {
  lists: Map<string, string[]>;
  parent: Map<string, string>;
}

function blockLists(board: Board): Lists {
  const lists = new Map<string, string[]>([['order', board.order]]);
  const parent = new Map<string, string>();
  for (const id of board.order) {
    parent.set(id, 'order');
    const col = board.columns[id];
    if (col) {
      lists.set(`col:${id}`, col.cardIds);
      for (const cid of col.cardIds) parent.set(cid, `col:${id}`);
    }
  }
  return { lists, parent };
}

interface ItemSet extends Lists {
  /** Each item without its sub-items. */
  items: Record<string, Omit<TodoItem, 'children'>>;
  /** The list card each item is in. */
  card: Map<string, string>;
}

function itemSet(board: Board): ItemSet {
  const out: ItemSet = { lists: new Map(), parent: new Map(), items: {}, card: new Map() };
  const walk = (xs: TodoItem[], key: string, cardId: string) => {
    out.lists.set(key, xs.map((x) => x.id));
    for (const x of xs) {
      const { children, ...rest } = x;
      out.items[x.id] = rest;
      out.parent.set(x.id, key);
      out.card.set(x.id, cardId);
      walk(children, `kids:${x.id}`, cardId);
    }
  };
  for (const card of Object.values(board.cards)) if (card.kind === 'todo') walk(card.items, `items:${card.id}`, card.id);
  return out;
}

/**
 * Where each surviving thing goes: where I put it if I moved it, else where they have it; failing
 * that (its list is gone), the other side's place, then `fallback`. Returns list name → members.
 */
function place(
  ids: string[],
  b: Lists,
  m: Lists,
  t: Lists,
  valid: (list: string) => boolean,
  fallback: (id: string) => string | null,
): Map<string, string> {
  const chosen = new Map<string, string>();
  for (const id of ids) {
    const pm = m.parent.get(id);
    const pt = t.parent.get(id);
    const first = pm !== undefined && pm !== b.parent.get(id) ? pm : (pt ?? pm);
    const other = first === pm ? pt : pm;
    const list = [first, other].find((l) => l !== undefined && valid(l)) ?? fallback(id);
    if (list !== null) chosen.set(id, list);
  }
  return chosen;
}

function orderAll(chosen: Map<string, string>, b: Lists, m: Lists, t: Lists): Map<string, string[]> {
  const members = new Map<string, Set<string>>();
  for (const [id, list] of chosen) {
    if (!members.has(list)) members.set(list, new Set());
    members.get(list)!.add(id);
  }
  const out = new Map<string, string[]>();
  for (const [list, set] of members)
    out.set(list, orderList(b.lists.get(list) ?? [], m.lists.get(list) ?? [], t.lists.get(list) ?? [], set));
  return out;
}

/** Positions change when blocks re-arrange themselves, which isn't an edit worth keeping a deleted block for. */
const edited = <E extends object>(was: E, now: E) => !deepEqual({ ...was, x: 0, y: 0 }, { ...now, x: 0, y: 0 });

function mergeCards(b: Board, m: Board, t: Board): Record<string, Card> {
  return mergeEntities<Card>(
    b.cards,
    m.cards,
    t.cards,
    (bc, mc, tc) => (mc.kind !== tc.kind || (bc && bc.kind !== mc.kind) ? (pick(bc, mc, tc) as Card) : mergeFields(bc, mc, tc, ['items'])),
    edited,
  );
}

/** Combines every checklist's items and puts them into the combined cards. */
function mergeItems(b: Board, m: Board, t: Board, cards: Record<string, Card>): Record<string, Card> {
  const [bi, mi, ti] = [itemSet(b), itemSet(m), itemSet(t)];
  const items = mergeEntities(bi.items, mi.items, ti.items, (bx, mx, tx) => mergeFields(bx, mx, tx));
  const isList = (id: string) => cards[id]?.kind === 'todo';
  const valid = (list: string) => (list.startsWith('items:') ? isList(list.slice(6)) : Boolean(items[list.slice(5)]));
  const ids = Object.keys(items);
  const cardOf = (id: string) => [mi, ti, bi].map((s) => s.card.get(id)).find((c) => c !== undefined && isList(c));
  const chosen = place(ids, bi, mi, ti, valid, (id) => {
    const c = cardOf(id);
    return c ? `items:${c}` : null;
  });
  // Two people nesting two items inside each other: lift one of them to the top of its list.
  for (const id of ids) {
    const seen = new Set<string>();
    let at: string | undefined = id;
    while (at !== undefined && !seen.has(at)) {
      seen.add(at);
      const list = chosen.get(at);
      at = list?.startsWith('kids:') ? list.slice(5) : undefined;
    }
    if (at === id) {
      const c = cardOf(id);
      if (c) chosen.set(id, `items:${c}`);
      else chosen.delete(id);
    }
  }
  const order = orderAll(chosen, bi, mi, ti);
  const build = (key: string): TodoItem[] => (order.get(key) ?? []).map((id) => ({ ...items[id], children: build(`kids:${id}`) }));
  const out = { ...cards };
  for (const [id, card] of Object.entries(cards)) if (card.kind === 'todo') out[id] = { ...card, items: build(`items:${id}`) } as TodoCard;
  return out;
}

function mergeArrows(b: Board, m: Board, t: Board, blocks: (id: string) => boolean): Arrow[] | undefined {
  const byId = (as: Arrow[] = []) => Object.fromEntries(as.map((a) => [a.id, a]));
  const kept = mergeEntities(byId(b.arrows), byId(m.arrows), byId(t.arrows), (ba, ma, ta) => mergeFields(ba, ma, ta));
  const ids = (as: Arrow[] = []) => as.map((a) => a.id);
  const members = new Set(Object.keys(kept).filter((id) => blocks(kept[id].from) && blocks(kept[id].to)));
  const arrows = orderList(ids(b.arrows), ids(m.arrows), ids(t.arrows), members).map((id) => kept[id]);
  return arrows.length || m.arrows || t.arrows ? arrows : undefined;
}

/** Combines my board and theirs, both changed from `base`. */
export function mergeBoards(base: Board, mine: Board, theirs: Board): Board {
  if (deepEqual(mine, base)) return theirs;
  if (deepEqual(theirs, base)) return mine;
  const columns = mergeEntities<Column>(base.columns, mine.columns, theirs.columns, (bc, mc, tc) => mergeFields(bc, mc, tc, ['cardIds']), edited);
  let cards = mergeCards(base, mine, theirs);
  cards = mergeItems(base, mine, theirs, cards);

  const [bl, ml, tl] = [blockLists(base), blockLists(mine), blockLists(theirs)];
  const valid = (list: string) => list === 'order' || Boolean(columns[list.slice(4)]);
  const chosen = place(Object.keys(cards), bl, ml, tl, valid, () => 'order');
  for (const id of Object.keys(columns)) chosen.set(id, 'order');
  const lists = orderAll(chosen, bl, ml, tl);
  const outColumns: Record<string, Column> = {};
  for (const [id, col] of Object.entries(columns)) outColumns[id] = { ...col, cardIds: lists.get(`col:${id}`) ?? [] };

  const merged: Board = {
    ...mergeFields(base, mine, theirs, ['cards', 'columns', 'order', 'arrows']),
    cards,
    columns: outColumns,
    order: lists.get('order') ?? [],
  };
  const arrows = mergeArrows(base, mine, theirs, (id) => Boolean(cards[id] || outColumns[id]));
  if (arrows) merged.arrows = arrows;
  if (deepEqual(merged, theirs)) return theirs;
  if (deepEqual(merged, mine)) return mine;
  return merged;
}

/** Combines several boards (by id): each one as in mergeBoards; added boards are kept. */
export function mergeBoardSets(
  base: Record<string, Board>,
  mine: Record<string, Board>,
  theirs: Record<string, Board>,
): Record<string, Board> {
  return mergeEntities(base, mine, theirs, (b, m, t) => mergeBoards(b ?? t, m, t));
}
