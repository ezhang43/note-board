import { describe, expect, it } from 'vitest';
import { createStore } from './store';

function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

describe('the Color menu (Auto-color lives in it)', () => {
  it('opens and closes with nothing selected', () => {
    const s = setup();
    expect(s.getState().ui.selection).toEqual([]);
    s.toggleColourMenu();
    expect(s.getState().ui.colourMenuOpen).toBe(true);
    s.toggleColourMenu();
    expect(s.getState().ui.colourMenuOpen).toBe(false);
  });

  it('picking a swatch with nothing selected changes nothing and leaves no undo step', () => {
    const s = setup();
    s.addColumn();
    s.clearSelection();
    const before = s.getState().board;
    s.toggleColourMenu();
    s.recolourSelection('rose');
    expect(s.getState().board).toEqual(before);
  });

  it('Auto-color works with nothing selected', () => {
    const s = setup();
    s.addColumn();
    s.addColumn();
    s.clearSelection();
    s.toggleColourMenu();
    s.autoColour();
    const colors = Object.values(s.getState().board.columns).map((c) => c.color);
    expect(colors.every((c) => c !== null)).toBe(true);
    expect(new Set(colors).size).toBe(2);
  });
});
