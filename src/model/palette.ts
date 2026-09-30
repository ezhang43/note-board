export const COLOR_KEYS = ['butter', 'peach', 'rose', 'lavender', 'sky', 'teal', 'mint', 'stone'] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export interface Swatch {
  label: string;
  bg: string;
  edge: string;
  text: string;
}

export const PALETTE: Record<ColorKey, Swatch> = {
  butter: { label: 'Butter', bg: '#FFF3CF', edge: '#EED9A0', text: '#6B4600' },
  peach: { label: 'Peach', bg: '#FDEBDD', edge: '#F2CDB0', text: '#7A3A0E' },
  rose: { label: 'Rose', bg: '#FCE7EC', edge: '#F2C4CF', text: '#8A1F3D' },
  lavender: { label: 'Lavender', bg: '#EFEAFB', edge: '#D5CAF2', text: '#4B2E8A' },
  sky: { label: 'Sky', bg: '#E6EEFC', edge: '#C3D4F2', text: '#1F4A8A' },
  teal: { label: 'Teal', bg: '#E0F2F1', edge: '#B7DEDB', text: '#155E58' },
  mint: { label: 'Mint', bg: '#E3F4EA', edge: '#BFE0CC', text: '#1B5A3C' },
  stone: { label: 'Stone', bg: '#F7F5F1', edge: '#E2DDD4', text: '#3F3B35' },
};

/** A column that has never been recoloured uses this neutral stone-grey. */
export const COLUMN_DEFAULT: Swatch = { label: 'Default', bg: '#EFECE6', edge: '#E2DDD4', text: '#1F1D1A' };

export function isColorKey(x: unknown): x is ColorKey {
  return typeof x === 'string' && (COLOR_KEYS as readonly string[]).includes(x);
}
