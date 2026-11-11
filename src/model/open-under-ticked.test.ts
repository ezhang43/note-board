import { describe, expect, it } from 'vitest';
import * as C from './checklist';
import type { TodoItem } from './types';
import { deleteRange } from './wordRange';

// Owner report 2026-11-03: a fully ticked checklist, then an open sub-item added under it: the
// parent must be unticked, since it is only complete once every sub-item under it is. The rule
// ("an open item never sits under a ticked one", job 183) held for Tab, drag and the Delete join;
// Enter, paste and the word-highlight split skipped it. Every way of adding an item follows it now.

const t = (id: string, children: TodoItem[] = [], done = false, text = id): TodoItem => ({ id, text, done, children });
/** "+" marks a ticked item, children in brackets. */
const outline = (items: TodoItem[]): string => items.map((i) => `${i.done ? '+' : ''}${i.id}${i.children.length ? `(${outline(i.children)})` : ''}`).join(' ');
const blank = () => t('n');
/** A whole checklist ticked: parent p with two sub-items, and a ticked sibling q. */
const ticked = () => [t('p', [t('a', [], true), t('b', [], true)], true), t('q', [], true)];

describe('Enter never leaves an open item under a ticked one', () => {
  it('at the end of the last ticked sub-item: its new open sibling unticks the parent', () => {
    const r = C.enterItem(ticked(), 'b', 1, 1, blank())!;
    expect(outline(r.items)).toBe('p(+a +b n) +q');
  });

  it('at the end of a ticked parent that has sub-items: the new first sub-item unticks it', () => {
    const r = C.enterItem(ticked(), 'p', 1, 1, blank())!;
    expect(outline(r.items)).toBe('p(n +a +b) +q');
  });

  it('at the start of a ticked sub-item: the blank item above unticks the parent', () => {
    const r = C.enterItem(ticked(), 'a', 0, 0, blank())!;
    expect(outline(r.items)).toBe('p(n +a +b) +q');
  });

  it('unticks every ticked item above, all the way up, and leaves ticked siblings alone', () => {
    const deep = [t('x', [t('y', [t('z', [], true)], true), t('w', [], true)], true)];
    const r = C.enterItem(deep, 'z', 1, 1, blank())!;
    expect(outline(r.items)).toBe('x(y(+z n) +w)');
  });

  it('a ticked top-level item with no sub-items: nothing above to untick, and nothing else changes', () => {
    expect(outline(C.enterItem(ticked(), 'q', 1, 1, blank())!.items)).toBe('+p(+a +b) +q n');
  });

  it('splitting a ticked sub-item keeps both halves ticked, so the parent stays ticked', () => {
    const items = [t('p', [t('ab', [], true, 'a b')], true)];
    const r = C.enterItem(items, 'ab', 1, 1, blank())!;
    expect(outline(r.items)).toBe('+p(+ab +n)');
  });

  it('the input list is not changed', () => {
    const before = ticked();
    C.enterItem(before, 'b', 1, 1, blank());
    expect(outline(before)).toBe('+p(+a +b) +q');
  });
});

describe('the word-highlight split (Enter over highlighted words)', () => {
  it('Enter over words at the end of a ticked sub-item unticks the parent', () => {
    const items = [t('p', [t('hello', [], true, 'hello world')], true)];
    const r = deleteRange(items, { anchor: { id: 'hello', offset: 5 }, focus: { id: 'hello', offset: 11 } }, '')!;
    const s = C.enterItem(r.items, r.focus.id, r.focus.offset, r.focus.offset, blank())!;
    expect(outline(s.items)).toBe('p(+hello n)');
  });
});

describe('pasting never leaves an open item under a ticked one', () => {
  it('pasteItemsAfter: an open item pasted after a ticked sub-item unticks the parent', () => {
    expect(outline(C.pasteItemsAfter(ticked(), 'b', [t('x')]))).toBe('p(+a +b x) +q');
  });

  it('pasteItemsInto (also the Journal paste): open items pasted after a ticked sub-item unticks the parent', () => {
    expect(outline(C.pasteItemsInto(ticked(), 'b', [t('x'), t('y')]))).toBe('p(+a +b x y) +q');
  });

  it('pasted in place of a blank sub-item: the parent is unticked too', () => {
    const items = [t('p', [t('a', [], true), t('', [], true, '')], true)];
    expect(outline(C.pasteItemsInto(items, '', [t('x')]))).toBe('p(+a x)');
  });

  it('ticked pasted items do not untick anything', () => {
    expect(outline(C.pasteItemsAfter(ticked(), 'b', [t('x', [], true)]))).toBe('+p(+a +b +x) +q');
  });

  it('an open item nested in a pasted ticked item unticks that pasted item, not the ticked items beside it', () => {
    expect(outline(C.pasteItemsAfter(ticked(), 'q', [t('x', [t('y')], true), t('z', [], true)]))).toBe('+p(+a +b) +q x(y) +z');
  });

  it('pasting among open items changes no ticks', () => {
    expect(outline(C.pasteItemsAfter([t('p', [t('a')]), t('q', [], true)], 'a', [t('x')]))).toBe('p(a x) +q');
  });
});

describe('the other ways in keep following the rule, and ticking the last sub-item still ticks the parent', () => {
  it('insertItems (drag, move, the connector’s add_items and move_items) unticks the items above', () => {
    expect(outline(C.insertItems(ticked(), { mode: 'after', targetId: 'b' }, [t('x')])!)).toBe('p(+a +b x) +q');
    expect(outline(C.insertItems(ticked(), { mode: 'nest', targetId: 'p' }, [t('x')])!)).toBe('p(x +a +b) +q');
  });

  it('Tab nests under a ticked item and unticks it; Shift+Tab moves out to the level of its parent', () => {
    expect(outline(C.indentItem([t('p', [], true), t('x')], 'x')!)).toBe('p(x)');
    expect(outline(C.outdentItem([t('g', [t('p', [t('x')])])], 'x')!)).toBe('g(p x)');
  });

  it('ticking the last open sub-item ticks the parent (and so on upwards); unticking unticks the parents', () => {
    const open = [t('p', [t('a', [], true), t('b')])];
    expect(outline(C.setItemsDone(open, ['b'], true, '2026-11-11'))).toBe('+p(+a +b)');
    expect(outline(C.setItemsDone(C.setItemsDone(open, ['b'], true, '2026-11-11'), ['a'], false, '2026-11-11'))).toBe('p(a +b)');
  });
});
