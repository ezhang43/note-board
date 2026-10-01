import { describe, expect, it } from 'vitest';
import { COLOR_KEYS, COLUMN_DEFAULT, PALETTE } from './palette';
import { DARK_COLUMN_DEFAULT, DARK_PALETTE, DARK_INK, startingTheme, swatchFor } from './theme';

/** WCAG contrast ratio between two #RRGGBB colours. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('starting theme', () => {
  it('uses the choice saved on this device', () => {
    expect(startingTheme('dark', false)).toBe('dark');
    expect(startingTheme('light', true)).toBe('light');
  });

  it("with no saved choice (or a broken one), follows the computer's setting", () => {
    expect(startingTheme(null, true)).toBe('dark');
    expect(startingTheme(null, false)).toBe('light');
    expect(startingTheme('purple', true)).toBe('dark');
    expect(startingTheme('', false)).toBe('light');
  });
});

describe('column colours in dark mode', () => {
  it('light mode uses the usual pastels', () => {
    for (const key of COLOR_KEYS) expect(swatchFor(key, 'light')).toBe(PALETTE[key]);
    expect(swatchFor(null, 'light')).toBe(COLUMN_DEFAULT);
  });

  it('dark mode uses a deep shade of every colour, keeping its name', () => {
    for (const key of COLOR_KEYS) {
      expect(swatchFor(key, 'dark')).toBe(DARK_PALETTE[key]);
      expect(DARK_PALETTE[key].label).toBe(PALETTE[key].label);
    }
    expect(swatchFor(null, 'dark')).toBe(DARK_COLUMN_DEFAULT);
  });

  it('every dark colour is different, dark, and readable with the light text', () => {
    const bgs = COLOR_KEYS.map((k) => DARK_PALETTE[k].bg.toLowerCase());
    expect(new Set(bgs).size).toBe(COLOR_KEYS.length);
    for (const s of [...COLOR_KEYS.map((k) => DARK_PALETTE[k]), DARK_COLUMN_DEFAULT]) {
      expect(contrast(DARK_INK, s.bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(s.text, s.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#000000', s.bg)).toBeLessThan(3); // genuinely dark, not a pastel
    }
  });
});
