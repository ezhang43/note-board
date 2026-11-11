import { describe, expect, it } from 'vitest';
import { createBoard } from './board';
import { createCard } from './cards';
import * as C from './checklist';
import { cleanUp, restoreEntry } from './completed';
import { mergeBoards as merge } from './merge';
import { visibleItems } from './multiSelect';
import { readBoard, serializeBoard } from './persist';
import { findMatches, inFoldedItem } from './search';
import type { Board, TodoCard, TodoItem } from './types';
import * as W from './wordRange';

// Folding a parent item's sub-items (owner request, 2026-11-09): the fold is saved on the item as
// `folded: true` (left out when open), and the hidden sub-items are out of sight for everything that
// works on what is shown.

function item(id: string, children: TodoItem[] = [], extra: Partial<TodoItem> = {}): TodoItem {
  return { id, text: id, done: false, children, ...extra };
}
const ids = (items: TodoItem[]): string => items.map((i) => (i.children.length ? `${i.id}(${ids(i.children)})` : i.id)).join(' ');

/*
  a (folded)
    a1
      a1x
    a2
  b
*/
const sample = () => [item('a', [item('a1', [item('a1x')]), item('a2')], { folded: true }), item('b')];

let n = 0;
const makeId = (p: string) => `${p}${++n}`;

describe('folding an item', () => {
  it('toggleFold folds an item with sub-items and unfolds it again; the open state is left out, not saved as false', () => {
    const open = [item('a', [item('a1'), item('a2')]), item('b')];
    const folded = C.toggleFold(open, 'a')!;
    expect(folded[0].folded).toBe(true);
    expect(open[0].folded).toBeUndefined(); // the input is not changed
    const back = C.toggleFold(folded, 'a')!;
    expect('folded' in back[0]).toBe(false);
  });

  it('an item with no sub-items has nothing to fold', () => {
    expect(C.toggleFold([item('a')], 'a')).toBeNull();
    expect(C.toggleFold([item('a')], 'missing')).toBeNull();
  });

  it('isFolded needs sub-items: a fold left on an item with none counts as open', () => {
    expect(C.isFolded(item('a', [item('a1'), item('a2')], { folded: true }))).toBe(true);
    expect(C.isFolded(item('a', [], { folded: true }))).toBe(false);
    expect(C.isFolded(item('a', [item('a1')]))).toBe(false);
  });

  it('shownIds leaves out everything under a folded item; flatIds still lists them all', () => {
    expect(C.shownIds(sample())).toEqual(['a', 'b']);
    expect(C.flatIds(sample())).toEqual(['a', 'a1', 'a1x', 'a2', 'b']);
    const inner = [item('a', [item('a1', [item('a1x'), item('a1y')], { folded: true }), item('a2')])];
    expect(C.shownIds(inner)).toEqual(['a', 'a1', 'a2']);
  });

  it('the hidden ids are added to a selection that holds a folded item', () => {
    expect(C.withHidden(sample(), ['a'])).toEqual(['a', 'a1', 'a1x', 'a2']);
    expect(C.withHidden(sample(), ['b'])).toEqual(['b']);
  });
});

describe('what is shown is what the keys work on', () => {
  const card = (items: TodoItem[]): TodoCard => ({ ...(createCard('todo', 't1') as TodoCard), items });

  it('Ctrl+A takes only the items shown', () => {
    expect(visibleItems(card(sample()))).toEqual(['a', 'b']);
  });

  it('Shift+click from a folded item to the item below takes no hidden item', () => {
    expect(C.itemRange(sample(), 'a', 'b')).toEqual(['a', 'b']);
  });

  it('Enter at the end of a folded item adds the new item after the whole group, not inside the fold', () => {
    const r = C.enterItem(sample(), 'a', 1, 1, item('new'))!;
    expect(ids(r.items)).toBe('a(a1(a1x) a2) new b');
    expect(r.items[0].folded).toBe(true);
    expect(r.focus).toBe('new');
  });

  it('Enter in an open parent still adds its first sub-item', () => {
    const r = C.enterItem([item('a', [item('a1')])], 'a', 1, 1, item('new'))!;
    expect(ids(r.items)).toBe('a(new a1)');
  });

  it('Tab under a folded item unfolds it, so the nested item stays in sight', () => {
    const next = C.indentItem(sample(), 'b')!;
    expect(ids(next)).toBe('a(a1(a1x) a2 b)');
    expect(next[0].folded).toBeUndefined();
  });

  it('dropping items nested under a folded item unfolds it', () => {
    const next = C.insertItems(sample(), { mode: 'nest', targetId: 'a' }, [item('x')])!;
    expect(ids(next)).toBe('a(x a1(a1x) a2) b');
    expect(next[0].folded).toBeUndefined();
  });

  it('dropping after a folded item puts the items after the whole group; the drop mark sits on the folded row', () => {
    const next = C.insertItems(sample(), { mode: 'after', targetId: 'a' }, [item('x')])!;
    expect(ids(next)).toBe('a(a1(a1x) a2) x b');
    const hint = C.dropOnRow(sample(), 'a', { xInRow: 10, lowerHalf: true }, { ids: ['b'], height: 0 })!;
    expect(hint.markId).toBe('a');
  });

  it('Delete at the end of a folded item joins the next item shown, not a hidden one', () => {
    const r = C.mergeNextItem(sample(), 'a')!;
    expect(r.items[0].text).toBe('ab');
    expect(ids(r.items)).toBe('a(a1(a1x) a2)');
  });

  it('Backspace in an empty item below a folded one puts the cursor on the folded item', () => {
    const items = [...sample(), { ...item('e'), text: '' }];
    expect(C.removeEmptyItem(items, 'e')!.focus).toBe('b');
    const after = [item('a', [item('a1'), item('a2')], { folded: true }), { ...item('e'), text: '' }, item('z')];
    expect(C.removeEmptyItem(after, 'e')!.focus).toBe('a');
  });
});

describe('copy, cut and paste carry the folded sub-items', () => {
  it('copying a folded item copies its hidden sub-items and keeps the fold', () => {
    const copied = C.copyItems(sample(), ['a']);
    expect(ids(copied)).toBe('a(a1(a1x) a2)');
    expect(copied[0].folded).toBe(true);
  });

  it('copied as text, the hidden sub-items come too', () => {
    expect(C.selectionAsText(sample(), ['a', 'b'])).toBe('a\n  a1\n    a1x\n  a2\nb');
  });

  it('cutting a folded item takes its hidden sub-items with it', () => {
    expect(ids(C.removeExactly(sample(), ['a'], makeId))).toBe('b');
  });

  it('fresh copies for a paste keep the fold', () => {
    expect(C.freshCopies(sample(), makeId)[0].folded).toBe(true);
  });

  it('a word highlight runs over the folded item as one row, and deleting it takes the fold with it', () => {
    const r = { anchor: { id: 'a', offset: 0 }, focus: { id: 'b', offset: 0 } };
    expect(W.touchedIds(sample(), r)).toEqual(['a']);
    expect(W.marksOf(sample(), r, 'a1')).toBeNull();
    const del = W.deleteRange(sample(), r)!;
    expect(ids(del.items)).toBe('b');
  });
});

describe('a fold with nothing left under it', () => {
  it('dropEmptyFolds removes the fold from an item whose last sub-item went, and keeps the same object when nothing changes', () => {
    let b: Board = createBoard();
    const card: TodoCard = { ...(createCard('todo', 't1') as TodoCard), items: [item('a', [], { folded: true }), item('b', [item('b1')], { folded: true })] };
    b = { ...b, cards: { t1: card }, order: ['t1'] };
    const tidy = C.dropEmptyFolds(createBoard(), b);
    const items = (tidy.cards.t1 as TodoCard).items;
    expect('folded' in items[0]).toBe(false);
    expect(items[1].folded).toBe(true);
    expect(C.dropEmptyFolds(tidy, tidy)).toBe(tidy);
    // Only cards that changed are looked at: an untouched card keeps its saved data as it is.
    expect(C.dropEmptyFolds(b, b)).toBe(b);
  });

  it('editItems, which every list change goes through (the app and the connector), drops it too', () => {
    const card: TodoCard = { ...(createCard('todo', 't1') as TodoCard), items: [item('a', [item('a1')], { folded: true }), item('b', [item('b1')], { folded: true })] };
    const b: Board = { ...createBoard(), cards: { t1: card }, order: ['t1'] };
    const after = (C.editItems(b, 't1', (its) => C.deleteItems(its, ['a1'], makeId)).cards.t1 as TodoCard).items;
    expect('folded' in after[0]).toBe(false);
    expect(after[1].folded).toBe(true);
  });
});

// Eric, 2026-11-11: "for sub-checklist items, the collapse button should only be there if there are 2 or more items."
describe('a fold needs two sub-items', () => {
  it('canFold is true from two direct sub-items, at any level', () => {
    expect(C.canFold(item('a'))).toBe(false);
    expect(C.canFold(item('a', [item('a1')]))).toBe(false);
    expect(C.canFold(item('a', [item('a1'), item('a2')]))).toBe(true);
    // Two levels down only counts for the item that has them as direct sub-items.
    expect(C.canFold(item('a', [item('a1', [item('x'), item('y')])]))).toBe(false);
  });

  it('a fold saved on an item with one sub-item counts as open: the sub-item shows, and the saved data is not rewritten', () => {
    const items = [item('a', [item('a1')], { folded: true }), item('b')];
    expect(C.isFolded(items[0])).toBe(false);
    expect(C.shownIds(items)).toEqual(['a', 'a1', 'b']);
    expect(items[0].folded).toBe(true);
    // Copying it takes nothing hidden, and a search match in the sub-item is not "in a folded item".
    expect(C.withHidden(items, ['a'])).toEqual(['a']);
    expect(C.isFolded(item('a', [item('a1'), item('a2')], { folded: true }))).toBe(true);
  });

  it('an item with one sub-item has nothing to fold', () => {
    expect(C.toggleFold([item('a', [item('a1')])], 'a')).toBeNull();
    expect(C.toggleFold([item('a', [item('a1')], { folded: true })], 'a')).toBeNull();
    expect(C.toggleFold([item('a', [item('a1'), item('a2')])], 'a')![0].folded).toBe(true);
  });

  it('a fold on an item with one sub-item is kept (not dropped as empty), so it is there again when a second one comes', () => {
    const card: TodoCard = { ...(createCard('todo', 't1') as TodoCard), items: [item('a', [item('a1')], { folded: true })] };
    const b: Board = { ...createBoard(), cards: { t1: card }, order: ['t1'] };
    const after = (C.editItems(b, 't1', (its) => its.map((it) => ({ ...it, text: 'x' }))).cards.t1 as TodoCard).items;
    expect(after[0].folded).toBe(true);
  });

  it('showItem opens only the folds that hide something: a saved fold on a one-sub-item ancestor is kept', () => {
    const items = [item('g', [item('p', [item('x')], { folded: true }), item('q')], { folded: true })];
    const shown = C.showItem(items, 'x');
    expect(shown[0].folded).toBeUndefined();
    expect(shown[0].children[0].folded).toBe(true);
  });

  it('hasFoldable says whether a list needs room for its top-level fold arrows', () => {
    expect(C.hasFoldable([item('a', [item('a1')]), item('b')])).toBe(false);
    expect(C.hasFoldable([item('a', [item('a1')]), item('b', [item('b1'), item('b2')])])).toBe(true);
    // Only top-level parents give the list its arrow room.
    expect(C.hasFoldable([item('a', [item('a1', [item('x'), item('y')]), item('a2')])])).toBe(true);
    expect(C.hasFoldable([item('a', [item('a1', [item('x'), item('y')])])])).toBe(false);
  });
});

describe('saving and syncing', () => {
  const board = (items: TodoItem[]): Board => {
    const card: TodoCard = { ...(createCard('todo', 't1') as TodoCard), items };
    return { ...createBoard(), cards: { t1: card }, order: ['t1'] };
  };

  it('a fold is saved and read back; an open item saves no fold field', () => {
    const back = readBoard(serializeBoard(board(sample())))!;
    const items = (back.cards.t1 as TodoCard).items;
    expect(items[0].folded).toBe(true);
    expect('folded' in items[1]).toBe(false);
  });

  it('anything but true in a saved fold is dropped, field by field, and the item is kept', () => {
    for (const bad of [false, 'yes', 1, null, {}]) {
      const raw = JSON.parse(serializeBoard(board(sample())));
      raw.board.cards.t1.items[0].folded = bad;
      const back = readBoard(JSON.stringify(raw))!;
      const items = (back.cards.t1 as TodoCard).items;
      expect('folded' in items[0]).toBe(false);
      expect(ids(items)).toBe('a(a1(a1x) a2) b');
    }
  });

  it('a fold saved on an item with no sub-items is read back as saved (so the connector can still write the data back unchanged)', () => {
    const back = readBoard(serializeBoard(board([item('a', [], { folded: true })])))!;
    expect((back.cards.t1 as TodoCard).items[0].folded).toBe(true);
  });

  it('an older app, which leaves out an item field it does not know, keeps the item whole and just shows it open', () => {
    // The older app's fallback is the same code path as any unknown item field today.
    const raw = JSON.parse(serializeBoard(board(sample())));
    raw.board.cards.t1.items[0].someNewField = true;
    delete raw.board.cards.t1.items[0].folded;
    raw.board.cards.t1.items[0].folded = true;
    const back = readBoard(JSON.stringify(raw))!;
    const items = (back.cards.t1 as TodoCard).items;
    expect('someNewField' in items[0]).toBe(false);
    expect(items[0]).toMatchObject({ id: 'a', text: 'a', done: false });
    expect(ids(items)).toBe('a(a1(a1x) a2) b');
  });

  it('two devices: one folds, the other edits the text; both changes are kept', () => {
    const base = board([item('a', [item('a1')]), item('b')]);
    const mine = board([item('a', [item('a1')], { folded: true }), item('b')]);
    const theirs = board([item('a', [item('a1')]), { ...item('b'), text: 'b edited' }]);
    const items = (merge(base, mine, theirs).cards.t1 as TodoCard).items;
    expect(items[0].folded).toBe(true);
    expect(items[1].text).toBe('b edited');
  });

  it('two devices: one unfolds, the other leaves it; it ends unfolded', () => {
    const base = board([item('a', [item('a1')], { folded: true })]);
    const mine = board([item('a', [item('a1')])]);
    const items = (merge(base, mine, base).cards.t1 as TodoCard).items;
    expect('folded' in items[0]).toBe(false);
  });
});

describe('search, Clean up and the Completed panel', () => {
  const board = (items: TodoItem[]): Board => {
    const card: TodoCard = { ...(createCard('todo', 't1') as TodoCard), title: 'List', items };
    return { ...createBoard(), cards: { t1: card }, order: ['t1'] };
  };

  it('a match in a folded sub-item rings the folded item (nothing is unfolded by a search)', () => {
    const m = findMatches(board(sample()), 'a1x');
    expect(m).toHaveLength(1);
    expect(m[0].showInstead).toBe('a');
    expect(findMatches(board(sample()), 'b')[0].showInstead).toBeNull();
  });

  it('the outermost fold is the one ringed', () => {
    const items = [item('a', [item('a1', [item('deep'), item('deep2')], { folded: true }), item('a2')], { folded: true })];
    expect(findMatches(board(items), 'deep')[0].showInstead).toBe('a');
  });

  it('a collapsed card still rings the card, folds or not', () => {
    const b = board(sample());
    const collapsed = { ...b, cards: { t1: { ...b.cards.t1, collapsed: true } } };
    expect(findMatches(collapsed, 'a1x')[0].showInstead).toBe('t1');
  });

  it('Clean up takes ticked hidden sub-items too, and the fold left with nothing under it is dropped', () => {
    const items = [item('a', [{ ...item('a1'), done: true }], { folded: true }), item('b')];
    const after = C.dropEmptyFolds(board(items), cleanUp(board(items), '2026-11-09', { type: 'loose', x: 0, y: 600 }).board);
    const left = (after.cards.t1 as TodoCard).items;
    expect(ids(left)).toBe('a b');
    expect('folded' in left[0]).toBe(false);
  });

  it('an item put back from the Completed panel under a folded item unfolds it, so it is in sight', () => {
    const items = [item('a', [{ ...item('a1'), done: true }, item('a2'), item('a3')]), item('b')];
    const cleaned = cleanUp(board(items), '2026-11-09', { type: 'loose', x: 0, y: 600 }).board;
    const folded = { ...cleaned, cards: { ...cleaned.cards, t1: { ...(cleaned.cards.t1 as TodoCard), items: C.toggleFold((cleaned.cards.t1 as TodoCard).items, 'a')! } } };
    const back = restoreEntry(folded, 'a1', { type: 'loose', x: 0, y: 0 }).board;
    const a = (back.cards.t1 as TodoCard).items[0];
    expect(ids([a])).toBe('a(a2 a3 a1)');
    expect(a.folded).toBeUndefined();
  });
});

describe('review fixes', () => {
  it('a word highlight that starts partway into a folded item copies and cuts only what is highlighted: its hidden sub-items stay with it', () => {
    const items = [item('a', [item('a1', [item('a1x')]), item('a2')], { folded: true, text: 'apple' }), item('b', [], { text: 'bean' })];
    const r = { anchor: { id: 'a', offset: 2 }, focus: { id: 'b', offset: 2 } };
    expect(ids(W.sliceRange(items, r))).toBe('a b'); // the tail of "apple" and the start of "bean", nothing hidden
    expect(W.rangeAsText(items, r)).toBe('ple\nbe');
    const del = W.deleteRange(items, r)!;
    // "apan" keeps its hidden sub-items, in their order; nothing else went.
    expect(ids(del.items)).toBe('a(a1(a1x) a2)');
    expect(del.items[0].text).toBe('apan');
  });

  it('a highlight that ends in a folded item leaves its hidden sub-items, which move up when it goes whole', () => {
    const items = [item('x'), item('a', [item('a1')], { folded: true }), item('b')];
    const toEnd = { anchor: { id: 'x', offset: 0 }, focus: { id: 'a', offset: 1 } };
    expect(ids(W.sliceRange(items, toEnd))).toBe('x a');
    expect(ids(W.deleteRange(items, toEnd)!.items)).toBe('a1 b');
  });

  it('joining a later item onto a folded first item puts its sub-items after the hidden ones', () => {
    const items = [item('a', [item('a1'), item('a2')], { folded: true }), item('c', [item('c1')])];
    const r = { anchor: { id: 'a', offset: 1 }, focus: { id: 'c', offset: 0 } };
    const del = W.deleteRange(items, r)!;
    expect(ids(del.items)).toBe('a(a1 a2 c1)');
    expect(del.items[0].folded).toBeUndefined();
  });

  it('showItem unfolds every item above the given one, and changes nothing when none is folded', () => {
    const items = [item('g', [item('p', [item('x')], { folded: true })], { folded: true })];
    const shown = C.showItem(items, 'x');
    expect(C.shownIds(shown)).toEqual(['g', 'p', 'x']);
    expect(C.showItem(shown, 'x')).toBe(shown);
    expect(items[0].folded).toBe(true); // the input is not changed
  });

  it('putting an item back under a folded grandparent opens every fold above it', () => {
    const b = (items: TodoItem[]): Board => ({ ...createBoard(), cards: { t1: { ...(createCard('todo', 't1') as TodoCard), items } }, order: ['t1'] });
    const cleaned = cleanUp(b([item('g', [item('p', [{ ...item('x'), done: true }, item('y'), item('y2')]), item('q')])]), '2026-11-09', { type: 'loose', x: 0, y: 600 }).board;
    const t1 = cleaned.cards.t1 as TodoCard;
    const folded = { ...cleaned, cards: { ...cleaned.cards, t1: { ...t1, items: C.toggleFold(C.toggleFold(t1.items, 'p')!, 'g')! } } };
    const back = restoreEntry(folded, 'x', { type: 'loose', x: 0, y: 0 }).board;
    expect(C.shownIds((back.cards.t1 as TodoCard).items)).toContain('x');
  });

  it('the cursor never goes to a hidden blank sub-item after a delete', () => {
    const items = [item('a', [{ ...item('h'), text: '' }, item('h2')], { folded: true }), item('z')];
    const after = [items[0]];
    expect(C.focusAfterRemoving(['z'], after, ['z'])).toBeNull();
  });

  it('inFoldedItem tells a match in a folded item from one in a closed card or column', () => {
    const board = { ...createBoard(), cards: { t1: { ...(createCard('todo', 't1') as TodoCard), items: sample() } }, order: ['t1'] };
    const [m] = findMatches(board, 'a1x');
    expect(inFoldedItem(board, m)).toBe(true);
    expect(inFoldedItem(board, { ...m, showInstead: 't1' })).toBe(false);
    expect(inFoldedItem(board, { ...m, showInstead: null })).toBe(false);
  });
});
