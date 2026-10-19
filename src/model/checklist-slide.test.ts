import { describe, expect, it } from 'vitest';
import * as C from './checklist';
import type { TodoItem } from './types';

function item(id: string, children: TodoItem[] = [], done = false): TodoItem {
  return { id, text: id, done, children };
}

// Press-and-hold on a phone lifts an item; the other rows slide to make room (job 114).
// The list shows: a, a1, a2, b, c, c1
const order = C.displayOrder([item('a', [item('a1'), item('a2')]), item('b'), item('c', [item('c1')], true)]);

describe('making room for a lifted item', () => {
  it('the gap opens before the row for a "before" mark, and after the marked row otherwise', () => {
    expect(C.gapBefore(order, { markId: 'b', markMode: 'before' }, ['a'])).toBe('b');
    expect(C.gapBefore(order, { markId: 'b', markMode: 'after' }, ['x'])).toBe('c');
    // Nesting puts the item first under the marked row, so the gap is right below it.
    expect(C.gapBefore(order, { markId: 'a', markMode: 'nest' }, ['x'])).toBe('a1');
    // After the last row there is no row to push down.
    expect(C.gapBefore(order, { markId: 'c1', markMode: 'after' }, ['x'])).toBeNull();
  });

  it('rows lifted out are skipped when looking for the row after the mark', () => {
    expect(C.gapBefore(order, { markId: 'a2', markMode: 'after' }, ['b'])).toBe('c');
  });

  it('moving an item down: the rows it passes slide up into its place', () => {
    // Lift "a" with its two sub-items (3 rows of 30) and drop it before "c": only b has to move.
    expect(C.slideOffsets(order, { a: 30, a1: 30, a2: 30 }, 'c', 90)).toEqual({ b: -90 });
  });

  it('moving an item up: the rows it passes slide down to make room', () => {
    expect(C.slideOffsets(order, { b: 30 }, 'a', 30)).toEqual({ a: 30, a1: 30, a2: 30 });
  });

  it('with no gap in this list the rows after the lifted item just close up', () => {
    expect(C.slideOffsets(order, { b: 30 }, null, 30)).toEqual({ c: -30, c1: -30 });
  });

  it('a list that does not hold the lifted item only gets the gap', () => {
    expect(C.slideOffsets(['p', 'q', 'r'], {}, 'q', 30)).toEqual({ q: 30, r: 30 });
    expect(C.slideOffsets(['p', 'q', 'r'], {}, null, 30)).toEqual({});
  });

  it('dropping an item back where it was moves nothing', () => {
    expect(C.slideOffsets(order, { b: 30 }, 'c', 30)).toEqual({});
  });
});
