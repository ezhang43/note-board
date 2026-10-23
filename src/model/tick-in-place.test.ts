import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard } from './cards';
import * as C from './checklist';
import { deleteTicked, tickedCount } from './completed';
import { visibleItems } from './multiSelect';
import { findMatches } from './search';
import type { Board, TodoCard, TodoItem } from './types';

// Ticked items stay in place (owner request, 2026-10-23, job 200): no Completed section in a list.

const item = (id: string, done = false, children: TodoItem[] = []): TodoItem => ({ id, text: id, done, children });
const outline = (items: TodoItem[]): string => items.map((i) => `${i.done ? '+' : ''}${i.id}${i.children.length ? `(${outline(i.children)})` : ''}`).join(' ');
const list = (id: string, items: TodoItem[], completedOpen = true): TodoCard => ({ ...(createCard('todo', id) as TodoCard), items, completedOpen });
const items = (b: Board, id: string) => (b.cards[id] as TodoCard).items;

describe('ticking leaves an item where it is', () => {
  it('a ticked top-level item keeps its place, and so does an unticked one', () => {
    const ticked = C.setItemsDone([item('a'), item('b'), item('c')], ['b'], true);
    expect(outline(ticked)).toBe('a +b c');
    expect(outline(C.setItemsDone(ticked, ['b'], false))).toBe('a b c');
  });

  it('the order shown is the list’s own order, ticked items included', () => {
    const l = [item('a'), item('b', true, [item('b1', true)]), item('c')];
    expect(C.itemRange(l, 'a', 'c')).toEqual(['a', 'b', 'b1', 'c']);
    expect(C.rootsOf(l, ['c', 'b'])).toEqual(['b', 'c']);
  });

  it('after a tick the cursor goes to the next open item below, past ticked ones', () => {
    const before = [item('a'), item('b', true), item('c')];
    const after = C.setItemsDone(before, ['a'], true);
    expect(C.nextOpenItem(before, after, 'a')).toBe('c');
  });

  it('Ctrl+Shift+Up / Down pass ticked items at the top level too', () => {
    const l = [item('a'), item('b', true), item('c')];
    expect(outline(C.moveItemBy(l, 'c', -1)!)).toBe('a c +b');
    expect(outline(C.moveItemBy(l, 'a', 1)!)).toBe('+b a c');
    expect(C.canMoveItem(l, 'b', -1)).toBe(true);
  });

  it('Tab nests an open item under a ticked one above it, which is unticked', () => {
    expect(outline(C.indentItem([item('a', true), item('b')], 'b')!)).toBe('a(b)');
  });

  it('Delete at the end of an item joins the item shown below, ticked or not', () => {
    const r = C.mergeNextItem([item('a'), item('b', true), item('c')], 'a')!;
    expect(outline(r.items)).toBe('a c');
    expect(r.items[0].text).toBe('ab');
  });

  it('a joined item stays ticked only when both were ticked, so open text is never hidden in a ticked item', () => {
    expect(outline(C.mergeNextItem([item('a', true), item('b')], 'a')!.items)).toBe('a');
    expect(outline(C.mergeNextItem([item('a'), item('b', true)], 'a')!.items)).toBe('a');
    expect(outline(C.mergeNextItem([item('a', true), item('b', true)], 'a')!.items)).toBe('+a');
  });

  it('joining never leaves an open item under a ticked one (job 183 rule)', () => {
    // The last item under ticked "p" joins open "q": the joined item is open, so "p" is unticked.
    expect(outline(C.mergeNextItem([item('p', true, [item('a', true)]), item('q', false, [item('q1')])], 'a')!.items)).toBe('p(a) q1');
    // A ticked item joins its ticked first sub-item; an open sub-item under that moves up under the ticked
    // item, which is unticked.
    expect(outline(C.mergeNextItem([item('p', true, [item('c', true, [item('g')])])], 'p')!.items)).toBe('p(g)');
  });
});

describe('a list’s items are all shown', () => {
  it('a list saved with its Completed section closed shows its ticked items too', () => {
    expect(visibleItems(list('L', [item('a'), item('b', true)], false))).toEqual(['a', 'b']);
  });

  it('Find does not count a ticked item as hidden', () => {
    const b = B.addCard(B.createBoard(), list('L', [item('milk', true)], false), { type: 'loose', x: 0, y: 0 });
    const m = findMatches(b, 'milk').find((x) => x.key.startsWith('item:'))!;
    expect(m.showInstead).toBeNull();
  });
});

describe('Ctrl+Shift+Backspace deletes every ticked item on the board', () => {
  const board = () =>
    B.addCard(B.createBoard(), list('L', [item('a', true, [item('a1', true)]), item('b', false, [item('b1', true), item('b2')]), item('c')]), {
      type: 'loose',
      x: 0,
      y: 0,
    });

  it('counts ticked items, sub-items under open items and what is under them included', () => {
    expect(tickedCount(board())).toBe(3);
  });

  it('removes them and leaves open items in place', () => {
    const b = deleteTicked(board());
    expect(outline(items(b, 'L'))).toBe('b(b2) c');
    expect(tickedCount(b)).toBe(0);
  });

  it('returns the same board when nothing is ticked', () => {
    const b = B.addCard(B.createBoard(), list('L', [item('a')]), { type: 'loose', x: 0, y: 0 });
    expect(deleteTicked(b)).toBe(b);
  });
});
