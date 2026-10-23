import { describe, expect, it } from 'vitest';
import { FONT_SCALE, FONT_SIZES, nextFontSize, startingFontSize } from './font';

describe('text size', () => {
  it('has nine steps, each larger than the last, ending at 250%', () => {
    expect(FONT_SIZES).toEqual(['small', 'normal', 'large', 'larger', 'huge', 'largest', 'enormous', 'giant', 'maximum']);
    expect(FONT_SCALE.huge).toBe(1.5);
    expect(FONT_SCALE.largest).toBe(1.75);
    expect(FONT_SCALE.enormous).toBe(2);
    expect(FONT_SCALE.giant).toBe(2.25);
    expect(FONT_SCALE.maximum).toBe(2.5);
    expect(FONT_SCALE.normal).toBe(1);
    expect(FONT_SIZES.map((s) => FONT_SCALE[s])).toEqual([...FONT_SIZES.map((s) => FONT_SCALE[s])].sort((a, b) => a - b));
  });

  it('A+ / A− step up and down, stopping at the ends', () => {
    expect(nextFontSize('normal', 1)).toBe('large');
    expect(nextFontSize('larger', 1)).toBe('huge');
    expect(nextFontSize('huge', 1)).toBe('largest');
    expect(nextFontSize('largest', 1)).toBe('enormous');
    expect(nextFontSize('enormous', 1)).toBe('giant');
    expect(nextFontSize('giant', 1)).toBe('maximum');
    expect(nextFontSize('maximum', 1)).toBe('maximum');
    expect(nextFontSize('maximum', -1)).toBe('giant');
    expect(nextFontSize('largest', -1)).toBe('huge');
    expect(nextFontSize('normal', -1)).toBe('small');
    expect(nextFontSize('small', -1)).toBe('small');
  });

  it('starts from the size saved on this device, or Normal', () => {
    expect(startingFontSize('large')).toBe('large');
    expect(startingFontSize('larger')).toBe('larger'); // saved before the two new steps
    expect(startingFontSize('largest')).toBe('largest');
    expect(startingFontSize('huge')).toBe('huge');
    expect(startingFontSize('maximum')).toBe('maximum');
    expect(startingFontSize(null)).toBe('normal');
    expect(startingFontSize('gigantic')).toBe('normal');
  });
});
