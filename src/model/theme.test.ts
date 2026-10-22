import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTO_COLOUR_ORDER, BOLD_KEYS, COLOR_KEYS, COLUMN_DEFAULT, PALETTE } from './palette';
import { COLOR_THEMES, COLOR_THEME_KEY, DARK_COLUMN_DEFAULT, DARK_PALETTE, DARK_INK, startingColorTheme, startingTheme, swatchFor } from './theme';

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

/** Dark mode's card background (--card-bg). */
const DARK_CARD = '#2A2824';

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

  it('are vivid and all different, yet readable: column text, its own text, card header tints and placeholders', () => {
    const bgs = COLOR_KEYS.map((k) => PALETTE[k].bg.toLowerCase());
    expect(new Set(bgs).size).toBe(COLOR_KEYS.length);
    for (const key of BOLD_KEYS) {
      const s = PALETTE[key];
      expect(contrast('#FFFFFF', s.bg)).toBeGreaterThanOrEqual(1.3); // clearly coloured: the pastels sit near 1.1 to 1.2
      expect(contrast('#1F1D1A', s.bg)).toBeGreaterThanOrEqual(7); // column title
      expect(contrast(s.text, s.bg)).toBeGreaterThanOrEqual(7); // count, hints and icons on the column
      expect(contrast(mix(s.text, s.bg, 0.8), s.bg)).toBeGreaterThanOrEqual(4.5); // "Container title" placeholder
      expect(contrast('#1F1D1A', mix(s.bg, '#FFFFFF', 0.6))).toBeGreaterThanOrEqual(7); // a card's header tint, with the usual ink
      expect(contrast(s.text, mix(s.bg, '#FFFFFF', 0.6))).toBeGreaterThanOrEqual(4.5); // its icons and title placeholder on the tint
    }
  });

  it('dark mode has a deep shade of each, readable the same way', () => {
    for (const key of BOLD_KEYS) {
      const s = DARK_PALETTE[key];
      expect(s.label).toBe(PALETTE[key].label);
      expect(contrast(DARK_INK, s.bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(s.text, s.bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(mix(s.text, s.bg, 0.8), s.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(DARK_INK, mix(s.bg, DARK_CARD, 0.6))).toBeGreaterThanOrEqual(7); // a card's header tint
      expect(contrast(s.text, mix(s.bg, DARK_CARD, 0.6))).toBeGreaterThanOrEqual(4.5); // its icons and title placeholder
    }
  });

  it("a card's header tint (Color, owner decision 2026-10-16) keeps the usual ink readable on every colour", () => {
    for (const key of COLOR_KEYS) {
      expect(contrast('#1F1D1A', mix(PALETTE[key].bg, '#FFFFFF', 0.6))).toBeGreaterThanOrEqual(7);
      expect(contrast(DARK_INK, mix(DARK_PALETTE[key].bg, DARK_CARD, 0.6))).toBeGreaterThanOrEqual(7);
    }
  });

  it('Auto-colour hands out the 8 bold colours first, then the pastels, each once', () => {
    expect(AUTO_COLOUR_ORDER.slice(0, 8)).toEqual(['ocean', 'tomato', 'emerald', 'violet', 'sunflower', 'magenta', 'grass', 'tangerine']);
    expect(AUTO_COLOUR_ORDER.slice(8)).toEqual(['sky', 'peach', 'mint', 'lavender', 'butter', 'teal', 'rose', 'lime', 'periwinkle', 'coral', 'aqua', 'orchid', 'sage', 'sand', 'slate', 'stone']);
    expect(new Set(AUTO_COLOUR_ORDER).size).toBe(24);
  });
});

// Colour themes (job 112): each changes the accent and the board's tint; the colours live in styles.css only.
describe('colour themes', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  const DARK = "\\[data-theme='dark'\\]";
  /** The variables a theme sets in styles.css ('base' = the plain Honey look), for its light or dark version. */
  function vars(root: string, dark: boolean) {
    const sel = root === 'base' ? `:root${dark ? DARK : ''}` : `:root\\[data-color-theme='${root}'\\]${dark ? DARK : ''}`;
    const m = new RegExp(`(?:^|\n)${sel}\\s*\\{([^}]*)\\}`).exec(css);
    expect(m, `${root} ${dark ? 'dark' : 'light'} block`).not.toBeNull();
    const out: Record<string, string> = {};
    for (const [, name, value] of m![1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[name] = value.trim();
    return out;
  }

  it('offers Honey (the default) and five more, in this order', () => {
    expect(COLOR_THEMES.map((t) => t.key)).toEqual(['honey', 'ocean', 'forest', 'lavender', 'rose', 'slate']);
    expect(COLOR_THEMES.map((t) => t.label)).toEqual(['Honey', 'Ocean', 'Forest', 'Lavender', 'Rose', 'Slate']);
  });

  it('starts with the choice saved on this device, or Honey for anything else', () => {
    expect(COLOR_THEME_KEY).toBe('note-board:color-theme');
    for (const t of COLOR_THEMES) expect(startingColorTheme(t.key)).toBe(t.key);
    for (const bad of [null, '', 'purple', 'OCEAN', '__proto__']) expect(startingColorTheme(bad)).toBe('honey');
  });

  const others = COLOR_THEMES.filter((t) => t.key !== 'honey');

  it('every other theme has a light and a dark version setting the same colours, and leaves cards alone', () => {
    const base = Object.keys(vars('base', false));
    for (const t of others) {
      const light = vars(t.key, false);
      const dark = vars(t.key, true);
      expect(Object.keys(dark).sort(), t.key).toEqual(Object.keys(light).sort());
      for (const name of Object.keys(light)) expect(base, `${t.key} ${name}`).toContain(name);
      for (const name of ['--card-bg', '--card-edge', '--ink', '--checkbox', '--danger']) expect(light, t.key).not.toHaveProperty(name);
      expect(light['--accent']).not.toBe(vars('base', false)['--accent']);
      expect(light['--canvas']).not.toBe(vars('base', false)['--canvas']);
      expect(dark['--canvas']).not.toBe(light['--canvas']);
    }
    expect(new Set(others.map((t) => vars(t.key, false)['--accent'])).size).toBe(others.length);
  });

  it("the dot shown for each theme is its own honey colour (the Share button)", () => {
    for (const t of COLOR_THEMES) expect(t.dot.toLowerCase()).toBe(vars(t.key === 'honey' ? 'base' : t.key, false)['--honey'].toLowerCase());
  });

  it('keeps text and buttons readable (WCAG AA, 4.5:1) in every theme, light and dark', () => {
    for (const t of COLOR_THEMES) {
      for (const dark of [false, true]) {
        const v = { ...vars('base', false), ...(dark ? vars('base', true) : {}), ...(t.key === 'honey' ? {} : vars(t.key, dark)) };
        const where = `${t.key} ${dark ? 'dark' : 'light'}`;
        for (const bg of [v['--canvas'], v['--surface'], v['--toolbar-bg'], v['--card-bg']]) {
          expect(contrast(v['--ink'], bg), `${where} ink on ${bg}`).toBeGreaterThanOrEqual(7);
          expect(contrast(v['--ink-soft'], bg), `${where} soft ink on ${bg}`).toBeGreaterThanOrEqual(4.5);
          expect(contrast(v['--accent'], bg), `${where} accent on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrast(v['--on-accent'], v['--accent']), `${where} New container button`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(v['--honey-ink'], v['--honey']), `${where} Share button`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(v['--accent-ink'], v['--accent-soft']), `${where} pressed switches`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(v['--accent-ink'], v['--drop-bg']), `${where} drop highlight`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(v['--accent-ink'], v['--surface']), `${where} accent text on a panel`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
