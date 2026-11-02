import { describe, expect, it } from 'vitest';
import * as C from './checklist';
import * as W from './wordRange';
import type { TodoItem } from './types';

// Word-style highlights across checklist items (owner request, 2026-11-01).

function item(id: string, text: string, children: TodoItem[] = [], extra: Partial<TodoItem> = {}): TodoItem {
  return { id, text, done: false, children, ...extra };
}
const shape = (items: TodoItem[]): string => items.map((i) => (i.children.length ? `${i.text}(${shape(i.children)})` : i.text)).join(' | ');
const at = (id: string, offset: number) => ({ id, offset });

/*
  alpha
    beta
    gamma
  delta
  echo
*/
const sample = () => [item('a', 'alpha', [item('b', 'beta'), item('g', 'gamma')]), item('d', 'delta'), item('e', 'echo')];

describe('the range', () => {
  it('runs either way round: the earlier point comes first', () => {
    expect(W.ordered(sample(), { anchor: at('d', 2), focus: at('b', 1) })).toEqual({ start: at('b', 1), end: at('d', 2) });
    expect(W.ordered(sample(), { anchor: at('b', 3), focus: at('b', 1) })).toEqual({ start: at('b', 1), end: at('b', 3) });
  });

  it('touches every item from its first to its last, as shown', () => {
    expect(W.touchedIds(sample(), { anchor: at('a', 2), focus: at('d', 1) })).toEqual(['a', 'b', 'g', 'd']);
  });

  it('an end at the very start of an item leaves that item out (nothing of it is highlighted)', () => {
    expect(W.touchedIds(sample(), { anchor: at('b', 1), focus: at('d', 0) })).toEqual(['b', 'g']);
    // Within one item it is still that item.
    expect(W.touchedIds(sample(), { anchor: at('d', 0), focus: at('d', 0) })).toEqual(['d']);
  });

  it('a start at the very end of an item leaves that item out too; only a line break highlighted touches none', () => {
    expect(W.touchedIds(sample(), { anchor: at('a', 5), focus: at('g', 2) })).toEqual(['b', 'g']);
    expect(W.touchedIds(sample(), { anchor: at('d', 2), focus: at('a', 5) })).toEqual(['b', 'g', 'd']);
    expect(W.touchedIds(sample(), { anchor: at('a', 5), focus: at('b', 0) })).toEqual([]);
    expect(W.touchedIds(sample(), { anchor: at('a', 5), focus: at('a', 5) })).toEqual(['a']);
  });

  it('is empty when its ends meet', () => {
    expect(W.isEmpty(sample(), { anchor: at('d', 2), focus: at('d', 2) })).toBe(true);
    expect(W.isEmpty(sample(), { anchor: at('d', 2), focus: at('d', 3) })).toBe(false);
    expect(W.isEmpty(sample(), { anchor: at('a', 5), focus: at('b', 0) })).toBe(false); // a line break
  });

  it('the highlighted letters of each item', () => {
    const r = { anchor: at('g', 2), focus: at('a', 3) };
    expect(W.marksOf(sample(), r, 'a')).toEqual([3, 5, true]);
    expect(W.marksOf(sample(), r, 'b')).toEqual([0, 4, true]);
    expect(W.marksOf(sample(), r, 'g')).toEqual([0, 2, false]);
    expect(W.marksOf(sample(), r, 'd')).toBeNull();
  });

  it('is gone when one of its ends is gone', () => {
    expect(W.touchedIds(sample(), { anchor: at('zz', 0), focus: at('d', 1) })).toEqual([]);
    expect(W.deleteRange(sample(), { anchor: at('zz', 0), focus: at('d', 1) })).toBeNull();
  });
});

describe('deleting a range (Delete, Backspace, typing over it, cut)', () => {
  it('in one item removes just those letters', () => {
    const r = W.deleteRange(sample(), { anchor: at('d', 1), focus: at('d', 4) })!;
    expect(shape(r.items)).toBe('alpha(beta | gamma) | da | echo');
    expect(r.focus).toEqual(at('d', 1));
  });

  it('joins what is left of the first and last items; the items between go', () => {
    const r = W.deleteRange(sample(), { anchor: at('b', 2), focus: at('d', 3) })!;
    // "be" + "ta": gamma (between) is gone.
    expect(shape(r.items)).toBe('alpha(beta) | echo');
    expect(C.findItem(r.items, 'b')!.item.text).toBe('beta');
    expect(r.focus).toEqual(at('b', 2));
  });

  it('the first item keeps its id, level and look; the last one goes', () => {
    const items = [item('x', 'Splitwise pay', [], { done: true, style: { bold: true } }), item('y', 'Check again', [], { done: true, style: { size: 'large' } })];
    const r = W.deleteRange(items, { anchor: at('x', 10), focus: at('y', 6) })!;
    expect(r.items).toEqual([{ id: 'x', text: 'Splitwise again', done: true, children: [], style: { bold: true } }]);
  });

  it('the joined item is ticked only if both the first and the last item were (as Delete at the end of an item, job 200)', () => {
    const two = (a: boolean, b: boolean) => [item('x', 'one', [], { done: a }), item('y', 'two', [], { done: b })];
    const joined = (a: boolean, b: boolean) => W.deleteRange(two(a, b), { anchor: at('x', 1), focus: at('y', 1) })!.items[0].done;
    expect(joined(true, true)).toBe(true);
    expect(joined(true, false)).toBe(false);
    expect(joined(false, true)).toBe(false);
    expect(joined(false, false)).toBe(false);
  });

  it('a last item highlighted to its very end goes whole: its tick does not change the first one', () => {
    const two = () => [item('x', 'one', [], { done: true }), item('y', 'two', [], { done: false })];
    const r = W.deleteRange(two(), { anchor: at('x', 1), focus: at('y', 3) })!;
    expect(r.items).toMatchObject([{ id: 'x', text: 'o', done: true }]);
    expect(r.removed).toBe(1);
  });

  it('an empty first item where the highlight starts is touched, and goes whole', () => {
    const list = () => [item('x', ''), item('y', 'two')];
    const r = { anchor: at('x', 0), focus: at('y', 1) };
    expect(W.touchedIds(list(), r)).toEqual(['x', 'y']);
    expect(W.deleteRange(list(), r)).toMatchObject({ items: [{ id: 'y', text: 'wo' }], removed: 1 });
  });

  it('a highlight from letter 0 of its first item removes the earlier items whole: the last item stays as it was (owner decision 2026-11-02)', () => {
    const items = [item('x', 'Buy milk'), item('y', 'Pay rent', [item('y1', 'kid')], { done: true, style: { bold: true } }), item('z', 'next')];
    const r = W.deleteRange(items, { anchor: at('y', 4), focus: at('x', 0) })!;
    expect(r.items).toEqual([
      { id: 'y', text: 'rent', done: true, children: [{ id: 'y1', text: 'kid', done: false, children: [] }], style: { bold: true } },
      { id: 'z', text: 'next', done: false, children: [] },
    ]);
    expect(r.focus).toEqual(at('y', 0));
    expect(r.removed).toBe(1);
    // A typed letter goes in front of what is left.
    const typed = W.deleteRange(items, { anchor: at('x', 0), focus: at('y', 4) }, 'X')!;
    expect(typed.items[0]).toMatchObject({ id: 'y', text: 'Xrent', done: true, style: { bold: true } });
    expect(typed.focus).toEqual(at('y', 1));
  });

  it('from letter 0 of the first item to the very end of the last: the last item goes whole too, its sub-items moving up (call 2026-11-02)', () => {
    const items = [item('x', 'Buy milk'), item('y', 'Pay rent', [item('y1', 'kid')], { done: true }), item('z', 'next')];
    const r = W.deleteRange(items, { anchor: at('x', 0), focus: at('y', 8) })!;
    expect(shape(r.items)).toBe('kid | next');
    expect(r.removed).toBe(2);
    expect(r.focus).toEqual(at('y1', 0)); // the cursor is where the words were: in the item that follows
  });

  it('from letter 0 to the very end of the last item with nothing after it: the cursor goes to the end of the item before, or a blank item stays when the whole list goes', () => {
    const items = [item('w', 'keep'), item('x', 'one'), item('y', 'two')];
    const r = W.deleteRange(items, { anchor: at('x', 0), focus: at('y', 3) })!;
    expect(shape(r.items)).toBe('keep');
    expect(r.focus).toEqual(at('w', 4));
    expect(r.removed).toBe(2);
    const all = W.deleteRange([item('x', 'one'), item('y', 'two')], { anchor: at('x', 0), focus: at('y', 3) })!;
    expect(all.items).toHaveLength(1);
    expect(all.items[0].text).toBe('');
    expect(all.focus).toEqual(at(all.items[0].id, 0));
    expect(all.removed).toBe(2);
  });

  it('a typed letter over a highlight from letter 0 to the very end of the last item keeps the last item, holding the letter', () => {
    const items = [item('x', 'one'), item('y', 'two', [item('y1', 'kid')])];
    const r = W.deleteRange(items, { anchor: at('x', 0), focus: at('y', 3) }, 'X')!;
    expect(shape(r.items)).toBe('X(kid)');
    expect(r.items[0].id).toBe('y');
    expect(r.focus).toEqual(at('y', 1));
    expect(r.removed).toBe(1);
  });

  it('from letter 0 into a sub-item: the sub-item stays, moving up into its parent\'s place', () => {
    const r = W.deleteRange(sample(), { anchor: at('a', 0), focus: at('g', 2) })!;
    expect(shape(r.items)).toBe('mma | delta | echo');
    expect(r.items[0].id).toBe('g');
    expect(r.removed).toBe(2);
  });

  it('says how many items went whole (for the Undo message): not the last one when some of its text is left', () => {
    expect(W.deleteRange(sample(), { anchor: at('d', 1), focus: at('d', 4) })!.removed).toBe(0);
    expect(W.deleteRange(sample(), { anchor: at('b', 2), focus: at('d', 3) })!.removed).toBe(1); // gamma; what is left of delta is joined on
    expect(W.deleteRange(sample(), { anchor: at('a', 5), focus: at('b', 4) })!.removed).toBe(1); // all of beta
    expect(W.deleteRange(sample(), { anchor: at('a', 2), focus: at('a', 2) }, 'X')!.removed).toBe(0);
  });

  it("the last item's sub-items move up under the joined item", () => {
    const items = [item('x', 'one'), item('y', 'two', [item('y1', 'two.1', [item('y2', 'two.2')])]), item('z', 'three')];
    const r = W.deleteRange(items, { anchor: at('x', 1), focus: at('y', 1) })!;
    expect(shape(r.items)).toBe('owo(two.1(two.2)) | three');
  });

  it('a range from inside an item to inside its own sub-item keeps the sub-items after it', () => {
    const r = W.deleteRange(sample(), { anchor: at('a', 2), focus: at('b', 2) })!;
    expect(shape(r.items)).toBe('alta(gamma) | delta | echo');
  });

  it('a sub-item after the range whose parent went moves up into its parent\'s place, as cut does', () => {
    const items = [item('x', 'one'), item('y', 'two', [item('y1', 'two.1'), item('y2', 'two.2')])];
    const r = W.deleteRange(items, { anchor: at('x', 3), focus: at('y1', 3) })!;
    expect(shape(r.items)).toBe('one.1 | two.2');
  });

  it('from the start of one item to the start of another removes the items before it whole (a highlight of whole items)', () => {
    const r = W.deleteRange(sample(), { anchor: at('d', 0), focus: at('a', 0) })!;
    expect(shape(r.items)).toBe('delta | echo');
    expect(r.items[0].id).toBe('d'); // delta stays as it was
    expect(r.removed).toBe(3);
  });

  it('typing over the range puts the letter where it was', () => {
    const r = W.deleteRange(sample(), { anchor: at('b', 2), focus: at('d', 3) }, 'X')!;
    expect(C.findItem(r.items, 'b')!.item.text).toBe('beXta');
    expect(r.focus).toEqual(at('b', 3));
  });

  it('an open sub-item moved under a ticked joined item unticks it (an open item never sits under a ticked one)', () => {
    const items = [item('x', 'one', [], { done: true }), item('y', 'two', [item('y1', 'open')])];
    const r = W.deleteRange(items, { anchor: at('x', 3), focus: at('y', 3) })!;
    expect(r.items[0].done).toBe(false);
    expect(shape(r.items)).toBe('one(open)');
  });

  it('never nests deeper than 6 levels', () => {
    let deep = item('d5', 'five');
    for (let i = 4; i >= 0; i--) deep = item(`d${i}`, `level${i}`, [deep]);
    const items = [deep, item('t', 'top', [item('t1', 'kid', [item('t2', 'grandkid')])])];
    const r = W.deleteRange(items, { anchor: at('d5', 2), focus: at('t', 1) })!;
    const depths = (list: TodoItem[], d = 0): number[] => list.flatMap((it) => [d, ...depths(it.children, d + 1)]);
    expect(Math.max(...depths(r.items))).toBe(C.MAX_DEPTH);
    expect(C.flatIds(r.items)).toEqual(['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 't1', 't2']);
  });

  it('keeps every letter outside the range', () => {
    const r = W.deleteRange(sample(), { anchor: at('a', 1), focus: at('e', 3) })!;
    expect(shape(r.items)).toBe('ao');
  });
});

describe('copying a range', () => {
  it('takes exactly the highlighted words, as items: a partial first and last item', () => {
    const r = { anchor: at('b', 2), focus: at('d', 3) };
    const copy = W.sliceRange(sample(), r);
    expect(shape(copy)).toBe('ta | gamma | del');
    // The plain text for other apps, indented relative to the least-indented item.
    expect(W.rangeAsText(sample(), r)).toBe('  ta\n  gamma\ndel');
  });

  it('keeps each item\'s own look and tick', () => {
    const items = [item('x', 'bold one', [], { style: { bold: true } }), item('y', 'ticked two', [], { done: true, style: { font: 'serif' } })];
    const copy = W.sliceRange(items, { anchor: at('x', 5), focus: at('y', 6) });
    expect(copy).toEqual([
      { id: 'x', text: 'one', done: false, children: [], style: { bold: true } },
      { id: 'y', text: 'ticked', done: true, children: [], style: { font: 'serif' } },
    ]);
  });

  it('within one item copies just those letters', () => {
    expect(shape(W.sliceRange(sample(), { anchor: at('d', 1), focus: at('d', 3) }))).toBe('el');
  });

  it('leaves out a first item highlighted only from its very end: no blank item, no empty first line', () => {
    const r = { anchor: at('a', 5), focus: at('b', 2) };
    expect(shape(W.sliceRange(sample(), r))).toBe('be');
    expect(W.rangeAsText(sample(), r)).toBe('be');
    expect(W.sliceRange(sample(), { anchor: at('a', 5), focus: at('b', 0) })).toEqual([]);
  });

  it('leaves out a last item with nothing of it highlighted', () => {
    expect(shape(W.sliceRange(sample(), { anchor: at('d', 0), focus: at('e', 0) }))).toBe('delta');
  });
});
