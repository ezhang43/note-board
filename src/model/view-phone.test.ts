import { describe, expect, it } from 'vitest';
import { PHONE_MARGIN } from './constants';
import { createView, phoneCardWidth, screenToBoard, viewFillingWidth } from './view';

// Phone: lists fill the screen width (owner request, job 113).

describe('phone: lists fill the screen width', () => {
  const size = { width: 390, height: 700 };
  const room = size.width - 2 * PHONE_MARGIN;

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
    const fit = viewFillingWidth(createView(), size, rect, { x: 150, y: 300 });
    expect(fit.zoom).toBeCloseTo(room / 240, 5);
    expect(rect.x * fit.zoom + fit.panX).toBeCloseTo(PHONE_MARGIN, 0);
  });
  it('keeps the tapped line where it was, up and down', () => {
    const view = { ...createView(), zoom: 0.8, panX: 10, panY: 40 };
    const at = { x: 150, y: 300 };
    const fit = viewFillingWidth(view, size, { x: 100, y: 50, w: 240, h: 200 }, at);
    expect(screenToBoard(fit, at).y).toBeCloseTo(screenToBoard(view, at).y, 1);
  });
  it('brings a tapped line that is off the screen back to the top or bottom margin', () => {
    const rect = { x: 0, y: 0, w: 240, h: 200 };
    const above = viewFillingWidth(createView(), size, rect, { x: 50, y: -80 });
    expect(screenToBoard(above, { x: 0, y: PHONE_MARGIN }).y).toBeCloseTo(-80, 1);
    const below = viewFillingWidth(createView(), size, rect, { x: 50, y: 900 });
    expect(screenToBoard(below, { x: 0, y: size.height - PHONE_MARGIN }).y).toBeCloseTo(900, 1);
  });
  it('stops at the zoom limits: a block too wide for 30% starts at the left margin, a narrow one at 250% is centred', () => {
    const wide = viewFillingWidth(createView(), size, { x: 500, y: 0, w: 3000, h: 200 }, { x: 50, y: 100 });
    expect(wide.zoom).toBe(0.3);
    expect(500 * 0.3 + wide.panX).toBeCloseTo(PHONE_MARGIN, 0);
    const narrow = viewFillingWidth(createView(), { width: 1000, height: 700 }, { x: 0, y: 0, w: 200, h: 200 }, { x: 50, y: 100 });
    expect(narrow.zoom).toBe(2.5);
    expect(narrow.panX).toBeCloseTo((1000 - 200 * 2.5) / 2, 0);
  });
  it('changes nothing when the block already fills the width', () => {
    const view = { ...createView(), panX: PHONE_MARGIN };
    expect(viewFillingWidth(view, size, { x: 0, y: 0, w: room, h: 200 }, { x: 50, y: 100 })).toEqual(view);
  });
});
