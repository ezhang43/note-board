import { COLUMN_DEFAULT, PALETTE, type ColorKey, type Swatch } from './palette';

/** Light or dark look. A per-device view setting: not board data, not undoable, not synced. */
export type Theme = 'light' | 'dark';

/** Where this device remembers a light / dark choice once the toggle has been pressed. */
export const THEME_KEY = 'note-board:theme';

/** Text colour on dark backgrounds (dark mode's --ink). */
export const DARK_INK = '#ECE8E1';

/** The choice saved on this device; with none saved, follow the computer's setting. */
export function startingTheme(saved: string | null, prefersDark: boolean): Theme {
  if (saved === 'light' || saved === 'dark') return saved;
  return prefersDark ? 'dark' : 'light';
}

/** Dark mode's column colours: a deep, muted shade of each palette colour, same names. */
export const DARK_PALETTE: Record<ColorKey, Swatch> = {
  butter: { label: 'Butter', bg: '#3B3420', edge: '#5A4E2C', text: '#F5DFA0' },
  sand: { label: 'Sand', bg: '#362F25', edge: '#54493A', text: '#E9D7BB' },
  peach: { label: 'Peach', bg: '#3E2D22', edge: '#604532', text: '#F6C9A7' },
  coral: { label: 'Coral', bg: '#3F2722', edge: '#633A31', text: '#F6B8A6' },
  rose: { label: 'Rose', bg: '#3D2229', edge: '#60353F', text: '#F3B4C3' },
  orchid: { label: 'Orchid', bg: '#39233A', edge: '#5A385A', text: '#E8B7E4' },
  lavender: { label: 'Lavender', bg: '#2E2840', edge: '#483E63', text: '#CFC1F2' },
  periwinkle: { label: 'Periwinkle', bg: '#262A42', edge: '#3C4266', text: '#BFC6F3' },
  sky: { label: 'Sky', bg: '#212C3E', edge: '#344662', text: '#B4CBF0' },
  aqua: { label: 'Aqua', bg: '#1D3238', edge: '#2E4E57', text: '#A7DCE8' },
  teal: { label: 'Teal', bg: '#1D3331', edge: '#2E504C', text: '#A6DBD6' },
  mint: { label: 'Mint', bg: '#1F3328', edge: '#315040', text: '#ADDDC1' },
  sage: { label: 'Sage', bg: '#283028', edge: '#404D3E', text: '#C4D4BA' },
  lime: { label: 'Lime', bg: '#2D3420', edge: '#475233', text: '#D2E39D' },
  slate: { label: 'Slate', bg: '#272C32', edge: '#3E4650', text: '#C6D0DB' },
  stone: { label: 'Stone', bg: '#2C2A27', edge: '#45413B', text: '#DDD7CD' },
};

/** An uncoloured column in dark mode. */
export const DARK_COLUMN_DEFAULT: Swatch = { label: 'Default', bg: '#2A2825', edge: '#3D3A35', text: DARK_INK };

/** The swatch to draw a colour with in this theme (null = an uncoloured column). */
export function swatchFor(key: ColorKey | null, theme: Theme): Swatch {
  if (theme === 'dark') return key ? DARK_PALETTE[key] : DARK_COLUMN_DEFAULT;
  return key ? PALETTE[key] : COLUMN_DEFAULT;
}
