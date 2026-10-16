import { describe, expect, it } from 'vitest';
import { placeCard, tourPending } from './tour';

const view = { w: 1000, h: 700 };
const card = { w: 300, h: 150 };

describe('placeCard', () => {
  it('sits below the target, lined up with its left edge', () => {
    expect(placeCard({ x: 100, y: 20, w: 80, h: 30 }, card, view)).toEqual({ left: 100, top: 62 });
  });
  it('flips above when there is no room below', () => {
    expect(placeCard({ x: 100, y: 640, w: 80, h: 40 }, card, view)).toEqual({ left: 100, top: 478 });
  });
  it('stays on screen at the right edge', () => {
    expect(placeCard({ x: 950, y: 20, w: 40, h: 30 }, card, view).left).toBe(688);
  });
  it('stays on screen at the left edge and when the window is smaller than the card', () => {
    expect(placeCard({ x: 0, y: 20, w: 40, h: 30 }, card, view).left).toBe(12);
    const p = placeCard({ x: 5, y: 5, w: 40, h: 30 }, card, { w: 200, h: 100 });
    expect(p.left).toBe(12);
    expect(p.top).toBe(12);
  });
});

describe('tourPending', () => {
  it('starts only when nothing is remembered', () => {
    expect(tourPending(() => null)).toBe(true);
    expect(tourPending(() => '1')).toBe(false);
  });
  it('does not start when the saved choice cannot be read', () => {
    expect(
      tourPending(() => {
        throw new Error('blocked');
      }),
    ).toBe(false);
  });
});
