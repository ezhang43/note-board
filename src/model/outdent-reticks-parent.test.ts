import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard } from './cards';
import * as C from './checklist';
import type { Board, TodoCard, TodoItem } from './types';

// Owner request 2026-11-22: a new sub-item added under a ticked parent unticks it; moving that sub-item
// out from under the parent (Shift+Tab, or a drag) ticks the parent again, exactly as deleting it would.

const t = (id: string, children: TodoItem[] = [], done = false, text = id): TodoItem => ({ id, text, done, children });
/** "+" marks a ticked item, children in brackets. */
const outline = (items: TodoItem[]): string => items.map((i) => `${i.done ? '+' : ''}${i.id}${i.children.length ? `(${outline(i.children)})` : ''}`).join(' ');
const blankKid = (id = 'n') => t(id, [], false, '');
/** The list without item `id`, wherever it sits. */
const without = (items: TodoItem[], id: string): TodoItem[] => items.filter((i) => i.id !== id).map((i) => ({ ...i, children: without(i.children, id) }));

const boardWith = (cards: Record<string, TodoItem[]>): Board =>
  Object.entries(cards).reduce(
    (b, [id, items], i) => B.addCard(b, { ...(createCard('todo', id) as TodoCard), items }, { type: 'loose', x: i * 400, y: 0 }),
    B.createBoard(),
  );
const itemsOf = (b: Board, id: string) => (b.cards[id] as TodoCard).items;

describe('Shift+Tab out of a parent re-ticks it like deleting would', () => {
  it('Enter under a ticked parent unticks it; Shift+Tab on the new item ticks it again', () => {
    const ticked = [t('p', [t('a', [], true)], true)];
    const added = C.enterItem(ticked, 'a', 1, 1, blankKid())!;
    expect(outline(added.items)).toBe('p(+a n)');
    expect(outline(C.outdentItem(added.items, 'n')!)).toBe('+p(+a) n');
  });

  it('the parent ends up exactly as deleting the item would leave it', () => {
    const cases: TodoItem[][] = [
      [t('p', [t('a', [], true), t('x')])], // the last open one leaves: ticks
      [t('p', [t('a', [], true), t('x'), t('y')])], // another open one stays: stays open
      [t('p', [t('x')])], // nothing left under it: keeps its tick as it is
      [t('p', [t('a', [], true), t('x', [], true)])], // a ticked one leaves: a parent left open by hand stays open
    ];
    for (const items of cases) expect(outline(without(C.outdentItem(items, 'x')!, 'x'))).toBe(outline(C.deleteItems(items, ['x'])));
  });

  it('a nested parent ticks, but its own parent stays open while the moved item sits in it', () => {
    const items = [t('g', [t('p', [t('a', [], true), t('x')]), t('r', [], true)])];
    expect(outline(C.outdentItem(items, 'x')!)).toBe('g(+p(+a) x +r)');
  });

  it('Shift+Tab with several items selected re-ticks the parent once they have all left', () => {
    const items = [t('p', [t('a', [], true), t('x'), t('y')])];
    expect(outline(C.outdentItems(items, ['x', 'y'])!)).toBe('+p(+a) x y');
  });

  it('a re-ticked parent gets no stale tick day', () => {
    const items = [t('p', [t('a', [], true), t('x')])];
    items[0].doneOn = '2026-11-01';
    const r = C.outdentItem(items, 'x')!;
    expect(r[0].done).toBe(true);
    expect(r[0].doneOn).toBeUndefined();
  });
});

describe('dragging a sub-item out of a parent re-ticks it like deleting would', () => {
  it('a drag to after the parent, in the same list', () => {
    const b = boardWith({ L: [t('p', [t('a', [], true), blankKid()]), t('q')] });
    const r = C.moveItems(b, 'L', ['n'], { cardId: 'L', drop: { mode: 'after', targetId: 'q' } });
    expect(outline(itemsOf(r, 'L'))).toBe('+p(+a) q n');
  });

  it('a drag into another list', () => {
    const b = boardWith({ L: [t('p', [t('a', [], true), t('x')]), t('q')], M: [t('m')] });
    const r = C.moveItems(b, 'L', ['x'], { cardId: 'M', drop: { mode: 'after', targetId: 'm' } });
    expect(outline(itemsOf(r, 'L'))).toBe('+p(+a) q');
    expect(outline(itemsOf(r, 'M'))).toBe('m x');
  });

  it('a drag out to a new list on the board', () => {
    const b = boardWith({ L: [t('p', [t('a', [], true), t('x')]), t('q')] });
    const r = C.moveItems(b, 'L', ['x'], { newList: { id: 'N', x: 0, y: 400 } });
    expect(outline(itemsOf(r, 'L'))).toBe('+p(+a) q');
    expect(outline(itemsOf(r, 'N'))).toBe('x');
  });

  it('a drag that stays inside the same parent leaves it open', () => {
    const b = boardWith({ L: [t('p', [t('a', [], true), t('x')])] });
    const r = C.moveItems(b, 'L', ['x'], { cardId: 'L', drop: { mode: 'before', targetId: 'a' } });
    expect(outline(itemsOf(r, 'L'))).toBe('p(x +a)');
  });

  it('moving a ticked sub-item out does not tick a parent left open by hand', () => {
    const b = boardWith({ L: [t('p', [t('a', [], true), t('b', [], true)]), t('q')] });
    const r = C.moveItems(b, 'L', ['b'], { cardId: 'L', drop: { mode: 'after', targetId: 'q' } });
    expect(outline(itemsOf(r, 'L'))).toBe('p(+a) q +b');
  });
});
