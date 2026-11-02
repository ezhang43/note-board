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

  it('the first item keeps its id, tick and look; the last one goes', () => {
    const items = [item('x', 'Splitwise pay', [], { done: true, style: { bold: true } }), item('y', 'Check again', [], { style: { size: 'large' } })];
    const r = W.deleteRange(items, { anchor: at('x', 10), focus: at('y', 6) })!;
    expect(r.items).toEqual([{ id: 'x', text: 'Splitwise again', done: true, children: [], style: { bold: true } }]);
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

  it('an end at the start of an item joins that item in whole (a highlight of whole items)', () => {
    const r = W.deleteRange(sample(), { anchor: at('d', 0), focus: at('a', 0) })!;
    expect(shape(r.items)).toBe('delta | echo');
    expect(r.items[0].id).toBe('a'); // the first item's id carries the text that is left
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

  it('leaves out a last item with nothing of it highlighted', () => {
    expect(shape(W.sliceRange(sample(), { anchor: at('d', 0), focus: at('e', 0) }))).toBe('delta');
  });
});
