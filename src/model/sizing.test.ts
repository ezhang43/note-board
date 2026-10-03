import { describe, expect, it } from 'vitest';
import { COLLAPSED_MIN_H } from './constants';
import { resizeTo } from './sizing';

describe('resizing', () => {
  it('snaps to the 20px grid when snapping is on and nothing matches', () => {
    expect(resizeTo('card', { w: 251, h: 173 }, [], true)).toEqual({ w: 260, h: 180, liveW: 251, liveH: 173, matchIds: [], label: '260 × 180' });
  });

  it('while dragging, the drawn size follows the pointer; it lands on the grid when let go', () => {
    const r = resizeTo('card', { w: 263.4, h: 151 }, [], true);
    expect([r.liveW, r.liveH]).toEqual([263, 151]);
    expect([r.w, r.h]).toEqual([260, 160]);
  });

  it('keeps exact sizes when snapping is off', () => {
    expect(resizeTo('card', { w: 251.4, h: 173 }, [], false)).toMatchObject({ w: 251, h: 173 });
  });

  it('stays within the size limits', () => {
    expect(resizeTo('card', { w: 50, h: 20 }, [], true)).toMatchObject({ w: 200, h: 100 });
    expect(resizeTo('card', { w: 5000, h: 5000 }, [], true)).toMatchObject({ w: 640, h: 700 });
    expect(resizeTo('column', { w: 100, h: null }, [], true)).toMatchObject({ w: 240, h: null });
  });

  it('within 8px of other blocks, matches their size exactly and says so', () => {
    const others = [
      { id: 'a', w: 247, h: 500 },
      { id: 'b', w: 247, h: 90 },
      { id: 'c', w: 400, h: 181 },
    ];
    expect(resizeTo('card', { w: 240, h: 300 }, others, true)).toEqual({
      w: 247,
      h: 300,
      liveW: 247, // a match clicks into place even while dragging
      liveH: 300,
      matchIds: ['a', 'b'],
      label: '247 × 300 · same width as 2 blocks',
    });
    expect(resizeTo('card', { w: 300, h: 176 }, others, true)).toMatchObject({ h: 181, label: '300 × 181 · same height as 1 block' });
    expect(resizeTo('card', { w: 395, h: 186 }, others, true)).toMatchObject({
      w: 400,
      h: 181,
      matchIds: ['c'],
      label: '400 × 181 · same width & height as 1 block',
    });
  });

  it('prefers the closest match, and does not match beyond 8px', () => {
    const others = [
      { id: 'near', w: 262, h: 999 },
      { id: 'nearer', w: 258, h: 999 },
    ];
    expect(resizeTo('card', { w: 257, h: 120 }, others, true)).toMatchObject({ w: 258, matchIds: ['nearer'] });
    expect(resizeTo('card', { w: 230, h: 120 }, others, true)).toMatchObject({ w: 240, matchIds: [] });
  });

  it('a column edge changes width only', () => {
    expect(resizeTo('column', { w: 331, h: null }, [], true)).toEqual({ w: 340, h: null, liveW: 331, liveH: null, matchIds: [], label: '340 wide' });
  });
});

describe('resizing a collapsed card', () => {
  it('can be as short as its header', () => {
    expect(resizeTo('card', { w: 240, h: 40 }, [], false, COLLAPSED_MIN_H).h).toBe(COLLAPSED_MIN_H);
    expect(resizeTo('card', { w: 240, h: 40 }, [], false).h).toBe(100);
  });
});
