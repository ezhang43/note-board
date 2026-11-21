import { describe, expect, it } from 'vitest';
import { dropPlace, placeAmong, sortShift } from './listDrag';

// Dragging one sheet of a list up or down (the Journal's general notes, owner request 2026-11-21).

// Three sheets, 100px tall, 8px apart: tops 0, 108, 216.
const rects = [
  { top: 0, height: 100 },
  { top: 108, height: 100 },
  { top: 216, height: 100 },
];

describe('dropPlace', () => {
  it('is where the dragged sheet would land: past the middle of a neighbour, it takes that place', () => {
    expect(dropPlace(rects, 0, 0)).toBe(0);
    expect(dropPlace(rects, 0, 50)).toBe(0); // its middle is at 100, short of the next one's 158
    expect(dropPlace(rects, 0, 120)).toBe(1);
    expect(dropPlace(rects, 0, 400)).toBe(2);
    expect(dropPlace(rects, 2, -120)).toBe(1);
    expect(dropPlace(rects, 2, -400)).toBe(0);
    expect(dropPlace(rects, 1, -40)).toBe(1); // its middle at 118, still below the first one's 50
    expect(dropPlace(rects, 1, -110)).toBe(0);
  });
});

describe('sortShift', () => {
  it('moves the dragged sheet with the pointer and those it passed by its height and the gap', () => {
    const down = { from: 0, to: 2, dy: 230, h: 100 };
    expect([0, 1, 2].map((i) => sortShift(i, down, 8))).toEqual([230, -108, -108]);
    const up = { from: 2, to: 1, dy: -120, h: 100 };
    expect([0, 1, 2].map((i) => sortShift(i, up, 8))).toEqual([0, 108, -120]);
    expect(sortShift(1, null, 8)).toBe(0);
  });
});

describe('placeAmong', () => {
  it('lands before the same neighbour as when the drag began, even if the list changed meanwhile', () => {
    // Began as [C, B, A]; A dragged to between C and B (place 1 among the others [C, B]).
    expect(placeAmong(['C', 'B', 'A'], 'A', ['C', 'B'], 1)).toBe(1);
    // Another device added N on top meanwhile: still between C and B.
    expect(placeAmong(['N', 'C', 'B', 'A'], 'A', ['C', 'B'], 1)).toBe(2);
    // To the end: after the last.
    expect(placeAmong(['N', 'C', 'B', 'A'], 'C', ['B', 'A'], 2)).toBe(3);
    // The neighbour went: the old place.
    expect(placeAmong(['C', 'A'], 'A', ['C', 'B'], 1)).toBe(1);
  });
});
