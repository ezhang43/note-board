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

  it('Up / Down neighbours run through nested and completed items, skipping a collapsed Completed section', () => {
    expect(C.neighbourItem(sample(), true, 'a', 1)).toBe('a1');
    expect(C.neighbourItem(sample(), true, 'b', 1)).toBe('c');
    expect(C.neighbourItem(sample(), true, 'c1', -1)).toBe('c');
    expect(C.neighbourItem(sample(), true, 'a', -1)).toBeNull();
    expect(C.neighbourItem(sample(), true, 'c1', 1)).toBeNull();
    expect(C.neighbourItem(sample(), false, 'b', 1)).toBeNull();
    expect(C.visibleOrder(sample(), false)).toEqual(['a', 'a1', 'a2', 'b']);
  });

  it('roots skip items already inside another selected item', () => {
    expect(C.rootsOf(sample(), ['a1', 'a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('Enter, Tab, Shift+Tab, Backspace', () => {
  it('Enter adds a new item right after, at the same level', () => {
    expect(ids(C.addItemAfter(sample(), 'a1', item('new'))!)).toBe('a(a1 new a2) b c(c1)');
    expect(ids(C.addItemAfter(sample(), 'a', item('new'))!)).toBe('a(a1 a2) new b c(c1)');
  });

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
  it('copies roots with their sub-items and pastes fresh copies after the selection', () => {
    const copied = C.copyItems(sample(), ['a', 'a1', 'b']);
    expect(ids(copied)).toBe('a(a1 a2) b');
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
