import type { Board, Card, Column, CompletedCard, CompletedEntry, CompletedGroup, NoteCard, TodoCard, TodoItem } from './types';

// Combining two people's edits to a board (real-time collaboration, owner request 2026-10-05).
// `base` is the board both started from, `mine` this page's board, `theirs` the one someone else
// saved. Changes to different things (cards, fields of a card, checklist items) are all
// kept. When both changed the very same thing, mine wins: it is the later change, since this page
// sends the combined board straight after. A thing deleted on one side but edited on the other is
// kept, so nothing typed is lost. The result always keeps the board's rules: every card in exactly
// one place, every item in one list.

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

/** Whether `t` puts the things it shares with `b` in another order (adding or deleting isn't reordering). */
function reordered(b: string[], t: string[]): boolean {
  const inB = new Set(b);
  const inT = new Set(t);
  return !deepEqual(
    t.filter((id) => inB.has(id)),
    b.filter((id) => inT.has(id)),
  );
}

/**
 * The order of one list: theirs if they reordered it, else mine (whole-app review M7: an item they
 * only added doesn't undo my reorder); then anything placed in it that
 * isn't there yet goes just after whatever came before it in mine (or theirs).
 */
function orderList(b: string[], m: string[], t: string[], members: Set<string>): string[] {
  const seq = reordered(b, t) ? t : m;
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

/**
 * A note's formatting (`rich`, from the Journal) is only used while it matches the note's text, so
 * text and formatting picked from different sides would show plain, and the next keystroke would
 * save it plain for good (job 119). When the two sides' words differ, the formatting comes with the
 * words that are kept: that side's formatting, or none if that side has none.
 */
function richWithText(n: NoteCard, m: NoteCard, t: NoteCard): NoteCard {
  if (m.text === t.text) return n;
  // simple: a formatting change made on words the other side changed at the same time is dropped
  // (keeping it needs a three-way merge of the formatting); the words are always kept. Upgrade if
  // the Journal panel ever edits shared boards, or own boards ever sync through this merge.
  const { rich: _picked, ...rest } = n;
  const rich = (n.text === m.text ? m : t).rich;
  return rich ? { ...rest, rich } : rest;
}

/**
 * The Completed card's day groups, entry by entry (whole-app review M4): both sides' Clean ups are
 * kept, and an entry put back in its list on one side stays out. Days newest first.
 */
function mergeGroups(b: CompletedGroup[], m: CompletedGroup[], t: CompletedGroup[]): CompletedGroup[] {
  type Dated = { date: string; entry: CompletedEntry };
  const flat = (gs: CompletedGroup[]): [string, Dated][] => gs.flatMap((g) => g.entries.map((entry) => [entry.item.id, { date: g.date, entry }]));
  const [fm, ft] = [flat(m), flat(t)];
  const kept = mergeEntities<Dated>(Object.fromEntries(flat(b)), Object.fromEntries(fm), Object.fromEntries(ft), (bx, mx, tx) => pick(bx, mx, tx)!);
  const order = [...new Set([...fm, ...ft].map(([id]) => id))].filter((id) => kept[id]);
  const dates = [...new Set(order.map((id) => kept[id].date))].sort().reverse();
  return dates.map((date) => ({ date, entries: order.filter((id) => kept[id].date === date).map((id) => kept[id].entry) }));
}

function mergeCards(b: Board, m: Board, t: Board): Record<string, Card> {
  return mergeEntities<Card>(
    b.cards,
    m.cards,
    t.cards,
    (bc, mc, tc) => {
      if (mc.kind !== tc.kind || (bc && bc.kind !== mc.kind)) return pick(bc, mc, tc) as Card;
      const out = mergeFields(bc, mc, tc, ['items', 'groups']);
      if (out.kind === 'completed')
        return { ...out, groups: mergeGroups((bc as CompletedCard | undefined)?.groups ?? [], (mc as CompletedCard).groups, (tc as CompletedCard).groups) };
      return out.kind === 'note' ? richWithText(out, mc as NoteCard, tc as NoteCard) : out;
    },
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
  for (const [id, card] of Object.entries(cards)) {
    if (card.kind !== 'todo') continue;
    // Each side deleted the other's last items (whole-app review M7): one blank item to type in, as a
    // reload would give it (persist.ts), with the same id on both pages.
    const built = build(`items:${id}`);
    out[id] = { ...card, items: built.length ? built : [{ id: `${id}_i0`, text: '', done: false, children: [] }] } as TodoCard;
  }
  return out;
}

/**
 * Columns and cards `side` deleted but `other` edited are kept, whole: they are put back on `side`
 * as they were in `base`, with what was in them (a column's cards, a list's items), as if `side` had
 * never deleted them. Otherwise only the edited part would come back (a list with just the item
 * that was typed in).
 */
function putBack(base: Board, side: Board, other: Board): Board {
  let out = side;
  for (const [id, col] of Object.entries(base.columns)) {
    if (out.columns[id] || !other.columns[id] || !edited(col, other.columns[id])) continue;
    const placed = new Set([...out.order, ...Object.values(out.columns).flatMap((c) => c.cardIds)]);
    const cardIds = col.cardIds.filter((cid) => base.cards[cid] && !placed.has(cid));
    const cards = { ...out.cards };
    for (const cid of cardIds) cards[cid] = base.cards[cid];
    out = { ...out, cards, columns: { ...out.columns, [id]: { ...col, cardIds } }, order: [...out.order, id] };
  }
  for (const [id, card] of Object.entries(base.cards)) {
    if (out.cards[id] || !other.cards[id] || !edited(card, other.cards[id])) continue;
    const colId = base.order.find((c) => base.columns[c]?.cardIds.includes(id));
    const col = colId ? out.columns[colId] : undefined;
    if (col) {
      const at = Math.min(base.columns[col.id].cardIds.indexOf(id), col.cardIds.length);
      const cardIds = [...col.cardIds.slice(0, at), id, ...col.cardIds.slice(at)];
      out = { ...out, cards: { ...out.cards, [id]: card }, columns: { ...out.columns, [col.id]: { ...col, cardIds } } };
    } else out = { ...out, cards: { ...out.cards, [id]: card }, order: [...out.order, id] };
  }
  return out;
}

/** Combines my board and theirs, both changed from `base`. */
export function mergeBoards(base: Board, mineAsIs: Board, theirsAsIs: Board): Board {
  if (deepEqual(mineAsIs, base)) return theirsAsIs;
  if (deepEqual(theirsAsIs, base)) return mineAsIs;
  const mine = putBack(base, mineAsIs, theirsAsIs);
  const theirs = putBack(base, theirsAsIs, mineAsIs);
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
    ...mergeFields(base, mine, theirs, ['cards', 'columns', 'order']),
    cards,
    columns: outColumns,
    order: lists.get('order') ?? [],
  };
  if (deepEqual(merged, theirsAsIs)) return theirsAsIs;
  if (deepEqual(merged, mineAsIs)) return mineAsIs;
  return merged;
}

/** A board with every block's position left out (see `edited`). */
const unplaced = (b: Board) => ({
  ...b,
  cards: Object.fromEntries(Object.entries(b.cards).map(([id, c]) => [id, { ...c, x: 0, y: 0 }])),
  columns: Object.fromEntries(Object.entries(b.columns).map(([id, c]) => [id, { ...c, x: 0, y: 0 }])),
});

/**
 * Combines several boards (by id): each one as in mergeBoards; added boards are kept. A board deleted
 * on one side whose blocks only re-arranged themselves on the other stays deleted (job 155 U4).
 */
export function mergeBoardSets(
  base: Record<string, Board>,
  mine: Record<string, Board>,
  theirs: Record<string, Board>,
): Record<string, Board> {
  return mergeEntities(base, mine, theirs, (b, m, t) => mergeBoards(b ?? t, m, t), (was, now) => !deepEqual(unplaced(was), unplaced(now)));
}
