import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard } from './cards';
import * as C from './checklist';
import type { Board, TodoCard, TodoItem } from './types';

/** Shorthand: it('a', [it('b')]) builds an item with id and text "a". */
function item(id: string, children: TodoItem[] = [], done = false): TodoItem {
  return { id, text: id, done, children };
}
const ids = (items: TodoItem[]): string => items.map((i) => (i.children.length ? `${i.id}(${ids(i.children)})` : i.id)).join(' ');

let n = 0;
const makeId = (p: string) => `${p}${++n}`;

/*
  a
    a1
    a2
  b
  c (done)
    c1
*/
const sample = () => [item('a', [item('a1'), item('a2')]), item('b'), item('c', [item('c1')], true)];

describe('reading a list', () => {
  it('shows open items first, then completed ones', () => {
    expect(C.displayOrder([item('x', [], true), item('y')])).toEqual(['y', 'x']);
    expect(C.displayOrder(sample())).toEqual(['a', 'a1', 'a2', 'b', 'c', 'c1']);
  });

  it('a range runs across open and completed items, either direction', () => {
    expect(C.itemRange(sample(), 'a2', 'c')).toEqual(['a2', 'b', 'c']);
    expect(C.itemRange(sample(), 'c1', 'b')).toEqual(['b', 'c', 'c1']);
  });

  it('roots skip items already inside another selected item', () => {
    expect(C.rootsOf(sample(), ['a1', 'a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('Enter, Tab, Shift+Tab, Backspace', () => {
  it('Tab nests an item (with its sub-items) under the one above', () => {
    expect(ids(C.indentItem(sample(), 'b')!)).toBe('a(a1 a2 b) c(c1)');
    expect(ids(C.indentItem(sample(), 'a2')!)).toBe('a(a1(a2)) b c(c1)');
  });

  it('Tab does nothing for the first item at its level', () => {
    expect(C.indentItem(sample(), 'a')).toBeNull();
    expect(C.indentItem(sample(), 'a1')).toBeNull();
  });

  it('a top-level item only nests under one in the same section', () => {
    const list = [item('open1'), item('done1', [], true), item('open2')];
    expect(ids(C.indentItem(list, 'open2')!)).toBe('open1(open2) done1');
  });

  it('never nests deeper than 6 levels', () => {
    // a → b → c → d → e → f is 6 levels (depths 0–5); g is its sibling at depth 0.
    const deep = [item('a', [item('b', [item('c', [item('d', [item('e', [item('f')])])])])]), item('g')];
    expect(C.indentItem(deep, 'g')).not.toBeNull(); // g at depth 1 is fine
    const six = [item('a', [item('b', [item('c', [item('d', [item('e', [item('f'), item('f2')])])])])])];
    expect(C.indentItem(six, 'f2')).toBeNull(); // would be depth 6
  });

  it('Shift+Tab moves an item out to just after its parent', () => {
    expect(ids(C.outdentItem(sample(), 'a1')!)).toBe('a(a2) a1 b c(c1)');
    expect(C.outdentItem(sample(), 'b')).toBeNull();
  });

  it('Backspace deletes an empty item and moves the cursor to the item above', () => {
    const list = [item('a'), { ...item('empty'), text: '' }, item('b')];
    expect(C.removeEmptyItem(list, 'empty')).toEqual({ items: [item('a'), item('b')], focus: 'a' });
  });

  it("Backspace keeps a list's last item and items with text", () => {
    expect(C.removeEmptyItem([{ ...item('only'), text: '' }], 'only')).toBeNull();
    expect(C.removeEmptyItem(sample(), 'b')).toBeNull();
  });

  it('Backspace in a blank item keeps its sub-items with text, moving them up a level', () => {
    const list = [item('a'), { ...item('p', [item('c1', [item('c1x')]), item('c2')]), text: '' }, item('q')];
    const out = C.removeEmptyItem(list, 'p')!;
    expect(ids(out.items)).toBe('a c1(c1x) c2 q');
    expect(out.items.find((i) => i.id === 'c1')!.text).toBe('c1');
    expect(out.focus).toBe('a');
  });

  it('Backspace in a blank first item with sub-items puts the cursor on the first kept sub-item', () => {
    const out = C.removeEmptyItem([{ ...item('p', [item('c')]), text: '' }], 'p')!;
    expect(ids(out.items)).toBe('c');
    expect(out.focus).toBe('c');
  });
});

describe('deleting a blank item that has sub-items (owner rule)', () => {
  const blank = (id: string, children: TodoItem[], done = false) => ({ ...item(id, children, done), text: '  ' });

  it('trash on a blank item keeps its sub-items with text, one level up, in its place', () => {
    const list = [item('a'), blank('p', [item('c1'), item('c2', [item('c2x')])]), item('b')];
    expect(ids(C.deleteItems(list, ['p'], makeId))).toBe('a c1 c2(c2x) b');
  });

  it('a nested blank item hands its sub-items to its own parent', () => {
    const list = [item('top', [blank('p', [item('c')]), item('s')])];
    expect(ids(C.deleteItems(list, ['p'], makeId))).toBe('top(c s)');
  });

  it('sub-items keep their text and ticks', () => {
    const list = [blank('p', [item('c1', [], true), item('c2')])];
    const out = C.deleteItems(list, ['p'], makeId);
    expect(out.map((i) => [i.text, i.done])).toEqual([
      ['c1', true],
      ['c2', false],
    ]);
  });

  it('if nothing under a blank item has text, everything goes as before', () => {
    const list = [item('a'), blank('p', [blank('c', [blank('d', [])])])];
    expect(ids(C.deleteItems(list, ['p'], makeId))).toBe('a');
  });

  it('an item with text still deletes everything under it', () => {
    expect(ids(C.deleteItems(sample(), ['a'], makeId))).toBe('b c(c1)');
  });

  it('selected sub-items are deleted along with their blank parent', () => {
    const list = [blank('p', [item('c1'), item('c2')]), item('b')];
    expect(ids(C.deleteItems(list, ['p', 'c1'], makeId))).toBe('c2 b');
  });

  it('cutting removes the sub-items too (they were copied with the parent)', () => {
    const list = [blank('p', [item('c1')]), item('b')];
    expect(ids(C.deleteItems(list, ['p'], makeId, false))).toBe('b');
  });
});

describe('ticking and deleting', () => {
  it('ticking a top-level item moves it (with sub-items) to Completed; a sub-item is only struck through', () => {
    const ticked = C.setItemsDone(sample(), ['a'], true);
    expect(C.sections(ticked).done.map((i) => i.id)).toEqual(['a', 'c']);
    const sub = C.setItemsDone(sample(), ['a1'], true);
    expect(C.sections(sub).open.map((i) => i.id)).toEqual(['a', 'b']);
    expect(C.findItem(sub, 'a1')!.item.done).toBe(true);
  });

  it('unticking a completed item brings it back', () => {
    expect(C.sections(C.setItemsDone(sample(), ['c'], false)).done).toEqual([]);
  });

  it('trash deletes an item and everything under it', () => {
    expect(ids(C.deleteItems(sample(), ['a'], makeId))).toBe('b c(c1)');
  });

  it('a list that becomes empty gets one blank item', () => {
    const out = C.deleteItems(sample(), ['a', 'b', 'c'], makeId);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: '', done: false, children: [] });
  });
});

describe('copy and paste items', () => {
  it('copies exactly the selected items (a2 was not selected) and pastes fresh copies after the selection', () => {
    const copied = C.copyItems(sample(), ['a', 'a1', 'b']);
    expect(ids(copied)).toBe('a(a1) b');
    const fresh = C.freshCopies(copied, makeId);
    expect(C.flatIds(fresh).some((id) => ['a', 'a1', 'a2', 'b'].includes(id))).toBe(false);
    const out = C.pasteItemsAfter(sample(), 'b', fresh);
    expect(out.map((i) => i.text)).toEqual(['a', 'b', 'a', 'b', 'c']);
  });
});

describe('dragging items', () => {
  it('moves an item with its sub-items before, after or nested under another', () => {
    const { rest, moving } = C.extractItems(sample(), ['a']);
    expect(ids(C.insertItems(rest, { mode: 'after', targetId: 'b' }, moving)!)).toBe('b a(a1 a2) c(c1)');
    expect(ids(C.insertItems(rest, { mode: 'before', targetId: 'c' }, moving)!)).toBe('b a(a1 a2) c(c1)');
    expect(ids(C.insertItems(rest, { mode: 'nest', targetId: 'b' }, moving)!)).toBe('b(a(a1 a2)) c(c1)');
    expect(ids(C.insertItems(rest, { mode: 'append' }, moving)!)).toBe('b c(c1) a(a1 a2)');
  });

  it('refuses a drop that would go deeper than 6 levels', () => {
    const deep = [item('a', [item('b', [item('c', [item('d', [item('e')])])])])]; // e is at depth 4
    const tall = [item('t', [item('t1')])]; // 2 levels
    expect(C.insertItems(deep, { mode: 'nest', targetId: 'e' }, tall)).toBeNull();
    expect(C.insertItems(deep, { mode: 'after', targetId: 'e' }, tall)).not.toBeNull();
  });

  function twoLists(): Board {
    let b = B.createBoard();
    b = B.addCard(b, { ...(createCard('todo', 'L1') as TodoCard), color: 'rose', items: sample() }, { type: 'loose', x: 0, y: 0 });
    b = B.addCard(b, { ...(createCard('todo', 'L2') as TodoCard), items: [item('x')] }, { type: 'loose', x: 400, y: 0 });
    return b;
  }
  const itemsOf = (b: Board, id: string) => (b.cards[id] as TodoCard).items;

  it('moves items into another list', () => {
    const b = C.moveItems(twoLists(), 'L1', ['a', 'b'], { cardId: 'L2', drop: { mode: 'before', targetId: 'x' } }, makeId);
    expect(ids(itemsOf(b, 'L2'))).toBe('a(a1 a2) b x');
    expect(ids(itemsOf(b, 'L1'))).toBe('c(c1)');
  });

  it('dropping on the board makes a "New list" in the source colour; an emptied source gets a blank item', () => {
    const b = C.moveItems(twoLists(), 'L2', ['x'], { newList: { id: 'N', x: 800, y: 40 } }, makeId);
    const list = b.cards.N as TodoCard;
    expect(list).toMatchObject({ title: 'New list', x: 800, y: 40, color: 'mint' });
    expect(ids(list.items)).toBe('x');
    expect(itemsOf(b, 'L2')).toHaveLength(1);
    expect(itemsOf(b, 'L2')[0].text).toBe('');
    expect(B.problems(b)).toEqual([]);

    const fromRose = C.moveItems(twoLists(), 'L1', ['b'], { newList: { id: 'R', x: 0, y: 400 } }, makeId);
    expect(fromRose.cards.R.color).toBe('rose');
  });

  it('reorders within the same list', () => {
    const b = C.moveItems(twoLists(), 'L1', ['b'], { cardId: 'L1', drop: { mode: 'nest', targetId: 'a2' } }, makeId);
    expect(ids(itemsOf(b, 'L1'))).toBe('a(a1 a2(b)) c(c1)');
  });

  it('the Completed section can be collapsed and expanded', () => {
    let b = twoLists();
    b = C.toggleCompletedSection(b, 'L1');
    expect((b.cards.L1 as TodoCard).completedOpen).toBe(false);
  });
});

describe('several selected items with Tab / Shift+Tab (owner request)', () => {
  it('Tab moves every selected item in one level together, keeping their order', () => {
    const items = [item('a'), item('b', [item('b1')]), item('c'), item('d')];
    expect(ids(C.indentItems(items, ['b', 'b1', 'c'])!)).toBe('a(b(b1) c) d');
  });

  it('Shift+Tab moves them all out one level, keeping their order', () => {
    const items = [item('a', [item('x'), item('y'), item('z')])];
    expect(ids(C.outdentItems(items, ['x', 'y'])!)).toBe('a(z) x y');
  });

  it('one that cannot move stays, and the rest still move (e.g. starting from the first item)', () => {
    expect(ids(C.indentItems([item('a'), item('b'), item('c'), item('d')], ['a', 'b', 'c'])!)).toBe('a(b c) d');
    expect(ids(C.outdentItems([item('a', [item('x')]), item('b')], ['x', 'b'])!)).toBe('a x b');
  });

  it('does nothing when none of them can move', () => {
    expect(C.indentItems([item('a'), item('b')], ['a'])).toBeNull();
    expect(C.outdentItems([item('a'), item('b')], ['a', 'b'])).toBeNull();
  });
});

describe('Delete at the end of an item (owner request)', () => {
  const t = (id: string, text: string, children: TodoItem[] = [], done = false): TodoItem => ({ id, text, done, children });

  it('pulls the next item up into this one, cursor at the join', () => {
    const r = C.mergeNextItem([t('a', 'Buy '), t('b', 'milk'), t('c', 'eggs')], 'a')!;
    expect(r.items.map((i) => i.text)).toEqual(['Buy milk', 'eggs']);
    expect(r.caret).toBe(4);
  });

  it("the next item's sub-items move up one level into its place", () => {
    const r = C.mergeNextItem([t('a', 'A'), t('b', 'B', [t('b1', 'B1')]), t('c', 'C')], 'a')!;
    expect(ids(r.items)).toBe('a b1 c');
    expect(r.items[0].text).toBe('AB');
  });

  it('pulls up a first sub-item too (the item shown right below)', () => {
    const r = C.mergeNextItem([t('a', 'A', [t('a1', 'one', [t('a11', 'deep')]), t('a2', 'two')])], 'a')!;
    expect(ids(r.items)).toBe('a(a11 a2)');
    expect(r.items[0].text).toBe('Aone');
  });

  it('does nothing at the end of the list, or from the last open item into Completed', () => {
    expect(C.mergeNextItem([t('a', 'A'), t('b', 'B')], 'b')).toBeNull();
    expect(C.mergeNextItem([t('a', 'A'), t('d', 'D', [], true)], 'a')).toBeNull();
    expect(C.mergeNextItem([t('a', 'A'), t('d', 'D', [], true), t('e', 'E', [], true)], 'd')!.items.map((i) => i.text)).toEqual(['A', 'DE']);
  });
});

describe('sub-items all ticked tick their item (owner request)', () => {
  const t = (id: string, done = false, children: TodoItem[] = []): TodoItem => ({ id, text: id, done, children });
  const doneIds = (items: TodoItem[]): string[] => items.flatMap((i) => [...(i.done ? [i.id] : []), ...doneIds(i.children)]);

  it('ticking the last open sub-item ticks the item (and upwards), so it moves to Completed', () => {
    const items = [t('a', false, [t('a1', true), t('a2', false, [t('x', true), t('y')])]), t('b')];
    const out = C.setItemsDone(items, ['y'], true);
    expect(doneIds(out)).toEqual(['a', 'a1', 'a2', 'x', 'y']);
    expect(C.sections(out).done.map((i) => i.id)).toEqual(['a']);
  });

  it('stops where an item still has open sub-items', () => {
    const out = C.setItemsDone([t('a', false, [t('a1'), t('a2')])], ['a1'], true);
    expect(doneIds(out)).toEqual(['a1']);
  });

  it('unticking a sub-item unticks the items it is in', () => {
    const out = C.setItemsDone([t('a', true, [t('a1', true, [t('z', true)])])], ['z'], false);
    expect(doneIds(out)).toEqual([]);
  });
});

describe('copying and cutting exactly what is highlighted (owner request)', () => {
  const t = (text: string, children: TodoItem[] = []): TodoItem => ({ id: text, text, done: false, children });
  /*
    Pack
      shoes
      coat
        scarf
    Leave
  */
  const list = () => [t('Pack', [t('shoes'), t('coat', [t('scarf')])]), t('Leave')];

  it('copies only the selected sub-items, not the whole sub-list', () => {
    expect(ids(C.copyItems(list(), ['Pack', 'shoes']))).toBe('Pack(shoes)');
    expect(ids(C.copyItems(list(), ['scarf', 'Leave']))).toBe('scarf Leave');
  });

  it('as text: one per line in the order shown, indented relative to the least-indented one', () => {
    expect(C.selectionAsText(list(), ['Pack', 'shoes'])).toBe('Pack\n  shoes');
    expect(C.selectionAsText(list(), ['coat', 'scarf', 'Leave'])).toBe('  coat\n    scarf\nLeave');
    expect(C.selectionAsText(list(), ['shoes', 'coat'])).toBe('shoes\ncoat');
  });

  it('cut removes exactly the selected items; unselected sub-items stay, moving up', () => {
    expect(ids(C.removeExactly(list(), ['Pack', 'shoes']))).toBe('coat(scarf) Leave');
    expect(ids(C.removeExactly(list(), ['coat']))).toBe('Pack(shoes scarf) Leave');
    expect(C.removeExactly([t('a')], ['a'], makeId)).toHaveLength(1); // never empties the list
  });
});

describe('pasting items never goes past 6 levels', () => {
  it('pastes after the nearest item higher up that leaves room', () => {
    // a > b > c > d > e > f: f is on the sixth level.
    const deep = [item('a', [item('b', [item('c', [item('d', [item('e', [item('f')])])])])])];
    const out = C.pasteItemsAfter(deep, 'f', [item('x', [item('y')])]);
    expect(C.findItem(out, 'x')?.depth).toBe(4);
    expect(C.findItem(out, 'y')?.depth).toBe(5);
    expect(ids(out)).toBe('a(b(c(d(e(f) x(y)))))');
  });
});

describe('an emptied list', () => {
  it('gets one blank item to type in', () => {
    expect(C.refill([], makeId)).toMatchObject([{ text: '', done: false, children: [] }]);
    const kept = [item('a')];
    expect(C.refill(kept, makeId)).toBe(kept);
  });
});

describe('dropping dragged items on a row', () => {
  // a(a1 a2) b c(c1): x is how far right of the row's left edge the pointer is, in board pixels.
  const at = (x: number, lowerHalf: boolean) => ({ xInRow: x, lowerHalf });
  const dragging = (ids: string[], height = 0) => ({ ids, height });

  it('top half: before the row; bottom half: after it', () => {
    expect(C.dropOnRow(sample(), 'b', at(10, false), dragging(['x']))).toEqual({ drop: { mode: 'before', targetId: 'b' }, markId: 'b', markMode: 'before' });
    expect(C.dropOnRow(sample(), 'b', at(10, true), dragging(['x']))).toEqual({ drop: { mode: 'after', targetId: 'b' }, markId: 'b', markMode: 'after' });
  });

  it('bottom half, far enough right: nested under the row', () => {
    const nestFrom = C.ITEM_INDENT * 0 + C.NEST_ZONE;
    expect(C.dropOnRow(sample(), 'b', at(nestFrom + 1, true), dragging(['x']))).toEqual({ drop: { mode: 'nest', targetId: 'b' }, markId: 'b', markMode: 'nest' });
    // a1 is one level in, so its nest zone starts one indent further right.
    expect(C.dropOnRow(sample(), 'a1', at(nestFrom + 1, true), dragging(['x']))?.drop.mode).toBe('after');
  });

  it('after an item with sub-items, the mark shows under its last sub-item', () => {
    expect(C.dropOnRow(sample(), 'a', at(10, true), dragging(['x']))).toEqual({ drop: { mode: 'after', targetId: 'a' }, markId: 'a2', markMode: 'after' });
  });

  it('never onto the dragged items themselves, or past 6 levels', () => {
    expect(C.dropOnRow(sample(), 'b', at(10, true), dragging(['b']))).toBeNull();
    expect(C.dropOnRow(sample(), 'a1', at(10, true), dragging(['x'], 5))).toBeNull();
    // Too deep to nest, but fine next to it.
    expect(C.dropOnRow(sample(), 'b', at(500, true), dragging(['x'], 5))?.drop.mode).toBe('after');
  });
});

describe('Enter, like a text editor (owner request)', () => {
  const texts = (items: TodoItem[]): string => items.map((i) => (i.children.length ? `${i.text}(${texts(i.children)})` : i.text)).join(' ');
  const list = () => [item('milk'), item('fruit', [item('apples')]), item('bread')];
  const blank = item('n');

  it('at the end: a new item directly below (as the first sub-item when it has sub-items)', () => {
    const r1 = C.enterItem(list(), 'milk', 4, 4, { ...blank, text: '' })!;
    expect(texts(r1.items)).toBe('milk  fruit(apples) bread');
    expect(r1).toMatchObject({ focus: 'n', offset: 0 });
    const r2 = C.enterItem(list(), 'fruit', 5, 5, { ...blank, text: '' })!;
    expect(ids(r2.items)).toBe('milk fruit(n apples) bread');
  });

  it('in the middle: the rest of the text moves to a new item directly below', () => {
    const r = C.enterItem([item('Buy milk and bread')], 'Buy milk and bread', 8, 8, { ...blank, text: '' })!;
    expect(r.items.map((i) => i.text)).toEqual(['Buy milk', 'and bread']);
    expect(r).toMatchObject({ focus: 'n', offset: 0 });
    // Split just after a space: the space is dropped from the first half instead.
    const r2 = C.enterItem([item('Buy milk and bread')], 'Buy milk and bread', 9, 9, { ...blank, text: '' })!;
    expect(r2.items.map((i) => i.text)).toEqual(['Buy milk', 'and bread']);
  });

  it('in the middle of an item with sub-items: the rest becomes its first sub-item; the sub-items stay', () => {
    const r = C.enterItem([item('fruit and veg', [item('apples')])], 'fruit and veg', 5, 5, { ...blank, text: '' })!;
    expect(texts(r.items)).toBe('fruit(and veg apples)');
  });

  it('at the start of an item with text: a new blank item right above; the cursor stays with the text', () => {
    const r = C.enterItem(list(), 'bread', 0, 0, { ...blank, text: '' })!;
    expect(texts(r.items)).toBe('milk fruit(apples)  bread');
    expect(r).toMatchObject({ focus: 'bread', offset: 0 });
  });

  it('with text selected, the selection is replaced by the split', () => {
    const r = C.enterItem([item('Buy milk and bread')], 'Buy milk and bread', 3, 8, { ...blank, text: '' })!;
    expect(r.items.map((i) => i.text)).toEqual(['Buy', 'and bread']);
  });

  it('a ticked item split in two keeps both halves ticked; a new blank item is never ticked', () => {
    const done = [item('a b', [], true)];
    expect(C.enterItem(done, 'a b', 1, 1, { ...blank, text: '' })!.items.map((i) => i.done)).toEqual([true, true]);
    expect(C.enterItem(done, 'a b', 3, 3, { ...blank, text: '' })!.items.map((i) => i.done)).toEqual([true, false]);
  });
});
