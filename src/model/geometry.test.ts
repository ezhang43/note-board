import { describe, expect, it } from 'vitest';
import { columnAt, freeSpot, insertIndex, overlaps, snapIf, snapToGrid } from './geometry';

describe('snapping', () => {
  it('rounds to the nearest 20px', () => {
    expect(snapToGrid(29)).toBe(20);
    expect(snapToGrid(31)).toBe(40);
    expect(snapToGrid(-11)).toBe(-20);
  });
});

describe('overlap', () => {
  const a = { x: 0, y: 0, w: 100, h: 100 };
  it('detects overlapping blocks', () => {
    expect(overlaps(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(true);
  });
  it('blocks that only touch do not overlap, but are too close with a gap', () => {
    const touching = { x: 100, y: 0, w: 50, h: 50 };
    expect(overlaps(a, touching)).toBe(false);
    expect(overlaps(a, touching, 10)).toBe(true);
    expect(overlaps(a, { ...touching, x: 110 }, 10)).toBe(false);
  });
});

describe('free spot', () => {
  it('keeps the spot when nothing is in the way', () => {
    expect(freeSpot({ x: 20, y: 40, w: 100, h: 100 }, [], 10, 20)).toEqual({ x: 20, y: 40 });
  });

  it('moves to the nearest spot that clears every block by the gap, on the grid', () => {
    const blocker = { x: 0, y: 0, w: 200, h: 200 };
    const spot = freeSpot({ x: 0, y: 0, w: 100, h: 100 }, [blocker], 10, 20);
    expect(overlaps({ ...spot, w: 100, h: 100 }, blocker, 10)).toBe(false);
    expect(Math.abs(spot.x % 20)).toBe(0);
    expect(Math.abs(spot.y % 20)).toBe(0);
    // Nearest way out is 120px up or left (the 100px block plus the 10px gap, rounded up to the grid).
    expect(Math.hypot(spot.x, spot.y)).toBe(120);
  });

  it('finds room among several blocks', () => {
    const others = [
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 120, y: 0, w: 100, h: 100 },
      { x: 0, y: 120, w: 100, h: 100 },
    ];
    const spot = freeSpot({ x: 20, y: 20, w: 100, h: 100 }, others, 10, 20);
    for (const o of others) expect(overlaps({ ...spot, w: 100, h: 100 }, o, 10)).toBe(false);
  });
});

describe('dropping into columns', () => {
  const cols = [
    { id: 'left', rect: { x: 0, y: 0, w: 280, h: 300 } },
    { id: 'right', rect: { x: 400, y: 0, w: 280, h: 300 } },
  ];
  it('finds the column under the pointer, including a little below it', () => {
    expect(columnAt({ x: 100, y: 100 }, cols, 60)).toBe('left');
    expect(columnAt({ x: 500, y: 350 }, cols, 60)).toBe('right');
    expect(columnAt({ x: 500, y: 400 }, cols, 60)).toBeNull();
    expect(columnAt({ x: 320, y: 100 }, cols, 60)).toBeNull();
  });

  it('inserts after every card whose middle is above the pointer', () => {
    const middles = [100, 200, 300];
    expect(insertIndex(50, middles)).toBe(0);
    expect(insertIndex(150, middles)).toBe(1);
    expect(insertIndex(250, middles)).toBe(2);
    expect(insertIndex(999, middles)).toBe(3);
    expect(insertIndex(10, [])).toBe(0);
  });
});

describe('snapping only when it is on', () => {
  it('snaps to the grid when on, and rounds to whole pixels when off', () => {
    expect(snapIf(true, 33)).toBe(40);
    expect(snapIf(false, 33.4)).toBe(33);
  });
});
