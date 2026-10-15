/** The 8 bold column colours: the Colour menu's third row (owner request, 2026-10-15). */
export const BOLD_KEYS = ['tomato', 'tangerine', 'sunflower', 'grass', 'emerald', 'ocean', 'violet', 'magenta'] as const;

/** Whether a colour is one of the bold ones (their soft greys would be too faint on it). */
export function isBold(key: string | null | undefined): boolean {
  return (BOLD_KEYS as readonly (string | null | undefined)[]).includes(key);
}

/**
 * The 24 column colours, in the order the Colour menu shows them: 16 pastels (by hue, greys
 * last), then the 8 bold ones.
 */
export const COLOR_KEYS = [
  'butter',
  'sand',
  'peach',
  'coral',
  'rose',
  'orchid',
  'lavender',
  'periwinkle',
  'sky',
  'aqua',
  'teal',
  'mint',
  'sage',
  'lime',
  'slate',
  'stone',
  ...BOLD_KEYS,
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export interface Swatch {
  label: string;
  bg: string;
  edge: string;
  text: string;
}

export const PALETTE: Record<ColorKey, Swatch> = {
  butter: { label: 'Butter', bg: '#FFF3CF', edge: '#EED9A0', text: '#6B4600' },
  sand: { label: 'Sand', bg: '#F4ECDF', edge: '#E3D3B9', text: '#5E4724' },
  peach: { label: 'Peach', bg: '#FDEBDD', edge: '#F2CDB0', text: '#7A3A0E' },
  coral: { label: 'Coral', bg: '#FDE4DC', edge: '#F4C4B5', text: '#8A2F17' },
  rose: { label: 'Rose', bg: '#FCE7EC', edge: '#F2C4CF', text: '#8A1F3D' },
  orchid: { label: 'Orchid', bg: '#F7E6F6', edge: '#E8C5E5', text: '#7A2A73' },
  lavender: { label: 'Lavender', bg: '#EFEAFB', edge: '#D5CAF2', text: '#4B2E8A' },
  periwinkle: { label: 'Periwinkle', bg: '#E4E7FC', edge: '#C5CBF3', text: '#2F3C8A' },
  sky: { label: 'Sky', bg: '#E6EEFC', edge: '#C3D4F2', text: '#1F4A8A' },
  aqua: { label: 'Aqua', bg: '#DCF2F7', edge: '#B3DDE8', text: '#135A6B' },
  teal: { label: 'Teal', bg: '#E0F2F1', edge: '#B7DEDB', text: '#155E58' },
  mint: { label: 'Mint', bg: '#E3F4EA', edge: '#BFE0CC', text: '#1B5A3C' },
  sage: { label: 'Sage', bg: '#E8EEE4', edge: '#CCD8C3', text: '#3D5233' },
  lime: { label: 'Lime', bg: '#EEF6D6', edge: '#D3E3A6', text: '#4A5C12' },
  slate: { label: 'Slate', bg: '#E7EBEF', edge: '#CBD3DC', text: '#36424F' },
  stone: { label: 'Stone', bg: '#F7F5F1', edge: '#E2DDD4', text: '#3F3B35' },
  tomato: { label: 'Tomato', bg: '#FF8C78', edge: '#E8553F', text: '#400A03' },
  tangerine: { label: 'Tangerine', bg: '#FFAA5C', edge: '#EE7F1A', text: '#4A2000' },
  sunflower: { label: 'Sunflower', bg: '#FFD84A', edge: '#E8B400', text: '#4D3800' },
  grass: { label: 'Grass', bg: '#A6DB5E', edge: '#6FB02A', text: '#253F00' },
  emerald: { label: 'Emerald', bg: '#5FD6A4', edge: '#1FA673', text: '#00301D' },
  ocean: { label: 'Ocean', bg: '#6BB8F5', edge: '#2E86D9', text: '#042446' },
  violet: { label: 'Violet', bg: '#B9A0FF', edge: '#8A63F0', text: '#220E52' },
  magenta: { label: 'Magenta', bg: '#F58BD6', edge: '#D94BB0', text: '#430732' },
};

/**
 * The order Auto-colour hands out colours in: the bold ones first, then the pastels. Neighbouring
 * entries are far apart in hue, so columns next to each other look clearly different.
 */
export const AUTO_COLOUR_ORDER: readonly ColorKey[] = [
  'ocean',
  'tomato',
  'emerald',
  'violet',
  'sunflower',
  'magenta',
  'grass',
  'tangerine',
  'sky',
  'peach',
  'mint',
  'lavender',
  'butter',
  'teal',
  'rose',
  'lime',
  'periwinkle',
  'coral',
  'aqua',
  'orchid',
  'sage',
  'sand',
  'slate',
  'stone',
];

/** A column that has never been recoloured uses this neutral stone-grey. */
export const COLUMN_DEFAULT: Swatch = { label: 'Default', bg: '#EFECE6', edge: '#E2DDD4', text: '#1F1D1A' };

export function isColorKey(x: unknown): x is ColorKey {
  return typeof x === 'string' && (COLOR_KEYS as readonly string[]).includes(x);
}
