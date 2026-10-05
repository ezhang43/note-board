import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard } from './cards';
import { antClimb, climbedCount, HILL_SUMMIT, trailPoint } from './antHill';
import { cleanUp, completedCardOf, restoreEntry } from './completed';
import type { Board, TodoCard, TodoItem } from './types';

const it_ = (id: string, done = false, children: TodoItem[] = []): TodoItem => ({ id, text: id, done, children });
const here = { type: 'loose', x: 500, y: 0 } as const;
let n = 0;
const makeId = (p: string) => `${p}${++n}`;

/** "Groceries": bread, +milk, +eggs(+box, label), fruit(+pears). */
function board(): Board {
  const list: TodoCard = {
    ...(createCard('todo', 'g') as TodoCard),
    title: 'Groceries',
    items: [it_('bread'), it_('milk', true), it_('eggs', true, [it_('box', true), it_('label')]), it_('fruit', false, [it_('pears', true)])],
  };
  return B.addCard(B.createBoard(), list, { type: 'loose', x: 0, y: 0 });
}

describe('the ant climbing the hill', () => {
  it('each hill takes 10 more items than the one before: 10, then 20, then 30…', () => {
    expect(antClimb(0)).toEqual({ hill: 1, step: 0, steps: 10, atTop: false });
    expect(antClimb(7)).toEqual({ hill: 1, step: 7, steps: 10, atTop: false });
    // The ant stays at the top, flag reached, until the next item starts the next hill.
    expect(antClimb(10)).toEqual({ hill: 1, step: 10, steps: 10, atTop: true });
    expect(antClimb(11)).toEqual({ hill: 2, step: 1, steps: 20, atTop: false });
    expect(antClimb(30)).toEqual({ hill: 2, step: 20, steps: 20, atTop: true });
    expect(antClimb(31)).toEqual({ hill: 3, step: 1, steps: 30, atTop: false });
    expect(antClimb(60)).toEqual({ hill: 3, step: 30, steps: 30, atTop: true });
  });

  it('counts every ticked item in the Completed card, ticked sub-items too, but not open sub-items', () => {
    const b = cleanUp(board(), '2026-10-05', here, makeId).board;
    // milk, eggs, box (under eggs), pears (a ticked sub-item of open "fruit"); "label" is open.
    expect(climbedCount(completedCardOf(b))).toBe(4);
    expect(climbedCount(null)).toBe(0);
  });

  it('goes back down when an item is sent back to its list (unticked in the Completed card)', () => {
    const b = cleanUp(board(), '2026-10-05', here, makeId).board;
    const back = restoreEntry(b, 'eggs', here, makeId).board;
    expect(climbedCount(completedCardOf(back))).toBe(2);
  });

  it('the trail runs from the foot of the hill up to the summit, always going higher', () => {
    const foot = trailPoint(0);
    const top = trailPoint(1);
    expect(top.x).toBeCloseTo(HILL_SUMMIT.x);
    expect(top.y).toBeCloseTo(HILL_SUMMIT.y);
    expect(foot.x).toBeLessThan(top.x);
    expect(foot.y).toBeGreaterThan(top.y); // y grows downwards
    let prev = foot;
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
      const p = trailPoint(t);
      expect(p.y).toBeLessThan(prev.y);
      expect(p.x).toBeGreaterThan(prev.x);
      prev = p;
    }
    // The ant leans with the slope: steep at the foot, level at the top.
    expect(trailPoint(0).angle).toBeLessThan(-20);
    expect(Math.abs(trailPoint(1).angle)).toBeLessThan(5);
  });

  it('keeps the ant on the hill for out-of-range values', () => {
    expect(trailPoint(-1)).toEqual(trailPoint(0));
    expect(trailPoint(2)).toEqual(trailPoint(1));
  });
});
