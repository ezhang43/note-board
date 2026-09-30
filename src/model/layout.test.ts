import { describe, expect, it } from 'vitest';
import { addCard, addColumn, createBoard } from './board';
import { createCard, createColumn } from './cards';
import { BLOCK_GAP } from './constants';
import { overlaps } from './geometry';
import { spotForNewBlock, topLevelRects } from './layout';

const unmeasured = () => undefined;

describe('placing new blocks', () => {
  it('puts the first block in the middle of the screen, on the grid', () => {
    const spot = spotForNewBlock(createBoard(), 240, 160, { x: 500, y: 400 }, unmeasured);
    expect(spot).toEqual({ x: 380, y: 320 });
  });

  it('never puts a new block on top of (or touching) existing blocks', () => {
    let b = createBoard();
    for (let i = 0; i < 12; i++) {
      const spot = spotForNewBlock(b, 240, 160, { x: 500, y: 400 }, unmeasured);
      const rect = { ...spot, w: 240, h: 160 };
      for (const r of topLevelRects(b, unmeasured)) expect(overlaps(rect, r, BLOCK_GAP)).toBe(false);
      b = i % 3 === 0 ? addColumn(b, { ...createColumn(), ...spot }) : addCard(b, createCard('note'), { type: 'loose', ...spot });
    }
  });

  it('uses the height a block was actually drawn at', () => {
    const b = addColumn(createBoard(), { ...createColumn('tall'), x: 360, y: 300 });
    const measured = (id: string) => (id === 'tall' ? 900 : undefined);
    const spot = spotForNewBlock(b, 240, 160, { x: 500, y: 400 }, measured);
    expect(overlaps({ ...spot, w: 240, h: 160 }, { x: 360, y: 300, w: 280, h: 900 }, BLOCK_GAP)).toBe(false);
  });

  it('when snap is off, the spot is not forced onto the grid', () => {
    const b = { ...createBoard(), snap: false };
    expect(spotForNewBlock(b, 240, 160, { x: 505, y: 407 }, unmeasured)).toEqual({ x: 385, y: 327 });
  });
});
