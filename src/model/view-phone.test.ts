import { describe, expect, it } from 'vitest';
import { PHONE_MARGIN } from './constants';
import { createView, phoneCardWidth, viewFillingWidth } from './view';

// Phone: lists fill the screen width (owner request, job 113).

describe('phone: lists fill the screen width', () => {
  const size = { width: 390, height: 700 };
  const room = size.width - 2 * PHONE_MARGIN;
  const top = { from: 300, to: 12 }; // the block's top is 300px down the screen now and goes to 12px

  it('a new card is as wide as the screen less a margin each side, whatever the zoom', () => {
    expect(phoneCardWidth(390, 1)).toBe(room);
    expect(phoneCardWidth(390, 0.5)).toBe(room * 2);
  });
  it('a new card keeps the card size limits', () => {
    expect(phoneCardWidth(390, 2.5)).toBe(200); // 143 would be narrower than the smallest card
    expect(phoneCardWidth(2000, 0.3)).toBe(1280);
  });

  it('fills the width: zooms so the block is the screen less margins, its left edge at the margin', () => {
    const rect = { x: 100, y: 50, w: 240, h: 200 };
    const fit = viewFillingWidth(createView(), size, rect, top);
    expect(fit.zoom).toBeCloseTo(room / 240, 5);
    expect(rect.x * fit.zoom + fit.panX).toBeCloseTo(PHONE_MARGIN, 0);
  });
  it('puts the top of the block at the wanted spot on the screen (owner request, job 198)', () => {
    const rect = { x: 100, y: 50, w: 240, h: 200 };
    const fit = viewFillingWidth(createView(), size, rect, { from: 50, to: 12 });
    expect(rect.y * fit.zoom + fit.panY).toBeCloseTo(12, 0);
  });
  it('whatever the zoom and pan it starts from, and whether the block is above or below the spot', () => {
    const rect = { x: 100, y: 500, w: 240, h: 200 };
    for (const panY of [-900, 40, 400]) {
      const view = { ...createView(), zoom: 0.8, panX: 10, panY };
      const fit = viewFillingWidth(view, size, rect, { from: rect.y * view.zoom + panY, to: 70 });
      expect(rect.y * fit.zoom + fit.panY).toBeCloseTo(70, 0);
    }
  });
  it('a block inside a container: its own top goes to the spot, the container sets the width and left edge', () => {
    const container = { x: 100, y: 50, w: 240, h: 900 };
    // The card is 400 board pixels down inside the container, so its top is at board y 450, on screen y 450 at zoom 1.
    const fit = viewFillingWidth(createView(), size, container, { from: 450, to: 12 });
    expect(450 * fit.zoom + fit.panY).toBeCloseTo(12, 0);
    expect(container.x * fit.zoom + fit.panX).toBeCloseTo(PHONE_MARGIN, 0);
  });
  it('stops at the zoom limits: a block too wide for 30% starts at the left margin, a narrow one at 250% is centred', () => {
    const wide = viewFillingWidth(createView(), size, { x: 500, y: 0, w: 3000, h: 200 }, top);
    expect(wide.zoom).toBe(0.3);
    expect(500 * 0.3 + wide.panX).toBeCloseTo(PHONE_MARGIN, 0);
    const narrow = viewFillingWidth(createView(), { width: 1000, height: 700 }, { x: 0, y: 0, w: 200, h: 200 }, top);
    expect(narrow.zoom).toBe(2.5);
    expect(narrow.panX).toBeCloseTo((1000 - 200 * 2.5) / 2, 0);
  });
  it('changes nothing when the block already fills the width', () => {
    const view = { ...createView(), panX: PHONE_MARGIN, panY: 12 };
    expect(viewFillingWidth(view, size, { x: 0, y: 0, w: room, h: 200 }, { from: 12, to: 12 })).toEqual(view);
  });
});
