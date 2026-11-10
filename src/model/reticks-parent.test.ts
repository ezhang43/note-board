import { describe, expect, it } from 'vitest';
import * as C from './checklist';
import type { TodoItem } from './types';

// Owner request 2026-11-10 ("yes re-tick"): a ticked parent that was unticked by a new blank sub-item
// ticks again when that item goes (Backspace, Delete, the trash can), if every sub-item left is ticked.
// It is the same rule as ticking the last open sub-item (setItemsDone), so it also goes up the chain.

const t = (id: string, children: TodoItem[] = [], done = false, text = id): TodoItem => ({ id, text, done, children });
/** "+" marks a ticked item, children in brackets. */
const outline = (items: TodoItem[]): string => items.map((i) => `${i.done ? '+' : ''}${i.id}${i.children.length ? `(${outline(i.children)})` : ''}`).join(' ');
const blankKid = (id = 'n') => t(id, [], false, '');

describe('removing a sub-item re-ticks a parent whose sub-items are all ticked', () => {
  it('a blank sub-item added under a ticked parent, then removed with Backspace: the parent is ticked again', () => {
    const ticked = [t('p', [t('a', [], true), t('b', [], true)], true)];
    const added = C.enterItem(ticked, 'b', 1, 1, blankKid())!;
    expect(outline(added.items)).toBe('p(+a +b n)'); // the add unticked it
    const r = C.removeEmptyItem(added.items, 'n')!;
    expect(outline(r.items)).toBe('+p(+a +b)');
    expect(r.focus).toBe('b');
  });

  it('removing an open sub-item with the trash can (deleteItems) re-ticks the parent when the rest are ticked', () => {
    const items = [t('p', [t('a', [], true), t('x', [], false), t('b', [], true)]), t('q')];
    expect(outline(C.deleteItems(items, ['x']))).toBe('+p(+a +b) q');
  });

  it('removing one of several sub-items leaves the parent open while another open sub-item is left', () => {
    const items = [t('p', [t('a', [], true), t('x'), t('y')])];
    expect(outline(C.deleteItems(items, ['x']))).toBe('p(+a y)');
  });

  it('goes up the chain: the grandparent ticks too when its sub-items are then all ticked', () => {
    const items = [t('g', [t('p', [t('a', [], true), t('x')], false), t('r', [], true)])];
    expect(outline(C.deleteItems(items, ['x']))).toBe('+g(+p(+a) +r)');
  });

  it('stops going up where a sibling is still open', () => {
    const items = [t('g', [t('p', [t('a', [], true), t('x')]), t('r')])];
    expect(outline(C.deleteItems(items, ['x']))).toBe('g(+p(+a) r)');
  });

  it('a parent left with no sub-items keeps its tick as it is', () => {
    expect(outline(C.deleteItems([t('p', [t('x')], false), t('q')], ['x']))).toBe('p q');
    expect(outline(C.deleteItems([t('p', [t('x')], true), t('q')], ['x']))).toBe('+p q');
  });

  it('a top-level item that goes does nothing to the others', () => {
    expect(outline(C.deleteItems([t('p', [t('a', [], true)]), t('x')], ['x']))).toBe('p(+a)');
  });

  it('several removed at once are judged on what is left', () => {
    const items = [t('p', [t('a', [], true), t('x'), t('y')])];
    expect(outline(C.deleteItems(items, ['x', 'y']))).toBe('+p(+a)');
  });

  it('removing a ticked sub-item does not tick a parent the user left open by hand', () => {
    const items = [t('p', [t('a', [], true), t('b', [], true)])];
    expect(outline(C.deleteItems(items, ['b']))).toBe('p(+a)');
  });

  it('a blank sub-item whose own sub-items with text move up: the parent is judged on what is left', () => {
    const items = [t('p', [t('a', [], true), t('n', [t('k', [], true)], false, '')])];
    expect(outline(C.deleteItems(items, ['n']))).toBe('+p(+a +k)');
    const open = [t('p', [t('a', [], true), t('n', [t('k')], false, '')])];
    expect(outline(C.deleteItems(open, ['n']))).toBe('p(+a k)');
  });

  it('Backspace on the blank sub-item still works when the re-tick leaves the whole list ticked', () => {
    const items = [t('p', [t('a', [], true), blankKid()])];
    const r = C.removeEmptyItem(items, 'n');
    expect(r && outline(r.items)).toBe('+p(+a)');
  });

  it('Backspace still refuses to delete the last open top-level item', () => {
    expect(C.removeEmptyItem([t('a', [], true), blankKid()], 'n')).toBeNull();
  });
});
