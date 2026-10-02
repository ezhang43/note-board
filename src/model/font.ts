// Text size on cards and columns (A− / A+ by the zoom control). A per-device view setting, like the
// light / dark choice: not board data, not undoable, not synced.

export type FontSize = 'small' | 'normal' | 'large' | 'larger';

export const FONT_SIZES: FontSize[] = ['small', 'normal', 'large', 'larger'];

/** How much bigger than Normal each size makes card and column text. */
export const FONT_SCALE: Record<FontSize, number> = { small: 0.9, normal: 1, large: 1.15, larger: 1.3 };

/** Where this device remembers the text size. */
export const FONT_KEY = 'note-board:font';

/** One step bigger (+1) or smaller (−1), stopping at the ends. */
export function nextFontSize(current: FontSize, step: 1 | -1): FontSize {
  const i = FONT_SIZES.indexOf(current) + step;
  return FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, i))];
}

/** The size saved on this device, or Normal. */
export function startingFontSize(saved: string | null): FontSize {
  return FONT_SIZES.includes(saved as FontSize) ? (saved as FontSize) : 'normal';
}
