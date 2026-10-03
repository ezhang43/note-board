import { describe, expect, it } from 'vitest';
import { EDGE_MAX_SPEED, EDGE_ZONE, edgePanStep } from './edgePan';

const area = { left: 0, top: 64, right: 1200, bottom: 800 };

describe('moving the board when a drag reaches the edge (owner request)', () => {
  it('does nothing away from the edges', () => {
    expect(edgePanStep({ x: 600, y: 400 }, area)).toEqual({ dx: 0, dy: 0 });
  });

  it('near the bottom, moves the board up to show more below; faster the closer you are', () => {
    const near = edgePanStep({ x: 600, y: area.bottom - EDGE_ZONE / 2 }, area);
    const edge = edgePanStep({ x: 600, y: area.bottom - 1 }, area);
    expect(near.dy).toBeLessThan(0);
    expect(edge.dy).toBeLessThan(near.dy);
    expect(Math.abs(edge.dy)).toBeLessThanOrEqual(EDGE_MAX_SPEED);
  });

  it('near the left, moves the board right; past the edge still counts as at the edge', () => {
    expect(edgePanStep({ x: 5, y: 400 }, area).dx).toBeGreaterThan(0);
    expect(edgePanStep({ x: -50, y: 400 }, area).dx).toBe(EDGE_MAX_SPEED);
  });
});
