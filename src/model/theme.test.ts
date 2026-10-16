import { describe, expect, it } from 'vitest';
import { AUTO_COLOUR_ORDER, BOLD_KEYS, COLOR_KEYS, COLUMN_DEFAULT, PALETTE } from './palette';
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

/** CSS color-mix(in srgb, a p, b): the share p of a, the rest b. */
function mix(a: string, b: string, p: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return '#' + [1, 3, 5].map((i) => Math.round(ch(a, i) * p + ch(b, i) * (1 - p)).toString(16).padStart(2, '0')).join('');
}

describe('bold colours (owner request, 2026-10-15)', () => {
  const PASTELS = ['butter', 'sand', 'peach', 'coral', 'rose', 'orchid', 'lavender', 'periwinkle', 'sky', 'aqua', 'teal', 'mint', 'sage', 'lime', 'slate', 'stone'];
  const BOLD = ['tomato', 'tangerine', 'sunflower', 'grass', 'emerald', 'ocean', 'violet', 'magenta'];

  it('keeps the 16 pastels unchanged and adds a third row of 8 bold colours', () => {
    expect([...COLOR_KEYS]).toEqual([...PASTELS, ...BOLD]);
    expect([...BOLD_KEYS]).toEqual(BOLD);
    expect(BOLD_KEYS.map((k) => PALETTE[k].label)).toEqual(['Tomato', 'Tangerine', 'Sunflower', 'Grass', 'Emerald', 'Ocean', 'Violet', 'Magenta']);
    expect(PALETTE.butter).toEqual({ label: 'Butter', bg: '#FFF3CF', edge: '#EED9A0', text: '#6B4600' });
    expect(PALETTE.stone).toEqual({ label: 'Stone', bg: '#F7F5F1', edge: '#E2DDD4', text: '#3F3B35' });
  });

  it('are vivid and all different, yet readable: column text, its own text, card title bands and placeholders', () => {
    const bgs = COLOR_KEYS.map((k) => PALETTE[k].bg.toLowerCase());
    expect(new Set(bgs).size).toBe(COLOR_KEYS.length);
    for (const key of BOLD_KEYS) {
      const s = PALETTE[key];
      expect(contrast('#FFFFFF', s.bg)).toBeGreaterThanOrEqual(1.3); // clearly coloured: the pastels sit near 1.1 to 1.2
      expect(contrast('#1F1D1A', s.bg)).toBeGreaterThanOrEqual(7); // column title
      expect(contrast(s.text, s.bg)).toBeGreaterThanOrEqual(7); // count, hints and icons on the column
      expect(contrast(mix(s.text, s.bg, 0.8), s.bg)).toBeGreaterThanOrEqual(4.5); // "Container title" placeholder
      expect(contrast('#1F1D1A', mix(s.edge, s.bg, 0.7))).toBeGreaterThanOrEqual(4.5); // card title band
      expect(contrast(s.text, mix(s.edge, s.bg, 0.7))).toBeGreaterThanOrEqual(4.5); // icons and placeholder on that band
    }
  });

  it('dark mode has a deep shade of each, readable the same way', () => {
    for (const key of BOLD_KEYS) {
      const s = DARK_PALETTE[key];
      expect(s.label).toBe(PALETTE[key].label);
      expect(contrast(DARK_INK, s.bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(s.text, s.bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(mix(s.text, s.bg, 0.8), s.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(DARK_INK, mix(s.edge, s.bg, 0.7))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(s.text, mix(s.edge, s.bg, 0.7))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('Auto-colour hands out the 8 bold colours first, then the pastels, each once', () => {
    expect(AUTO_COLOUR_ORDER.slice(0, 8)).toEqual(['ocean', 'tomato', 'emerald', 'violet', 'sunflower', 'magenta', 'grass', 'tangerine']);
    expect(AUTO_COLOUR_ORDER.slice(8)).toEqual(['sky', 'peach', 'mint', 'lavender', 'butter', 'teal', 'rose', 'lime', 'periwinkle', 'coral', 'aqua', 'orchid', 'sage', 'sand', 'slate', 'stone']);
    expect(new Set(AUTO_COLOUR_ORDER).size).toBe(24);
  });
});
