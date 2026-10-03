import { describe, expect, it } from 'vitest';
import { FONT_SCALE, FONT_SIZES, nextFontSize, startingFontSize } from './font';

describe('text size', () => {
  it('has four steps, Normal in the middle-ish, each larger than the last', () => {
    expect(FONT_SIZES).toEqual(['small', 'normal', 'large', 'larger']);
    expect(FONT_SCALE.normal).toBe(1);
    expect(FONT_SIZES.map((s) => FONT_SCALE[s])).toEqual([...FONT_SIZES.map((s) => FONT_SCALE[s])].sort((a, b) => a - b));
  });

  it('A+ / A− step up and down, stopping at the ends', () => {
    expect(nextFontSize('normal', 1)).toBe('large');
    expect(nextFontSize('larger', 1)).toBe('larger');
    expect(nextFontSize('normal', -1)).toBe('small');
    expect(nextFontSize('small', -1)).toBe('small');
  });

  it('starts from the size saved on this device, or Normal', () => {
    expect(startingFontSize('large')).toBe('large');
    expect(startingFontSize(null)).toBe('normal');
    expect(startingFontSize('huge')).toBe('normal');
  });
});
