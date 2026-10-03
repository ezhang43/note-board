import { blockOf, updateCard } from './board';
import { editItems, findItem, flatIds } from './checklist';
import type { Board, TextStyle } from './types';

// Formatting whole text boxes (owner request): size Small / Normal / Large, bold, italic and a
// typeface. Always the whole box (a card title, a note's text, a checklist item, a column title),
// never single words, so the text boxes stay plain text.

/** One text box: a card's title or note text, a checklist item, or a column's title. */
export type Box = { cardId: string; itemId?: string } | { columnId: string };

export type TextSize = 'small' | 'normal' | 'large';
export type TextFont = 'sans' | 'serif' | 'rounded' | 'hand' | 'mono';

/** One change from the format bar or a shortcut. */
export type StyleChange = { bold: boolean } | { italic: boolean } | { size: TextSize } | { font: TextFont };

const SIZES: TextSize[] = ['small', 'normal', 'large'];
export const TEXT_SCALE: Record<TextSize, number> = { small: 0.85, normal: 1, large: 1.3 };

/** The typefaces, in the order the Font menu lists them. */
export const FONTS: { key: TextFont; label: string }[] = [
  { key: 'sans', label: 'Plex Sans' },
  { key: 'serif', label: 'Serif' },
  { key: 'rounded', label: 'Rounded' },
  { key: 'hand', label: 'Handwritten' },
  { key: 'mono', label: 'Typewriter' },
];

/** Keeps only what differs from the usual look; undefined when nothing does. */
function tidy(s: TextStyle): TextStyle | undefined {
  const out: TextStyle = {};
  if (s.size) out.size = s.size;
  if (s.bold) out.bold = true;
  if (s.italic) out.italic = true;
  if (s.font) out.font = s.font;
  return Object.keys(out).length ? out : undefined;
}

/** A box's format after a change. */
function changed(style: TextStyle | undefined, change: StyleChange): TextStyle | undefined {
  const next: TextStyle = { ...style };
  if ('bold' in change) next.bold = change.bold || undefined;
  if ('italic' in change) next.italic = change.italic || undefined;
  if ('size' in change) next.size = change.size === 'normal' ? undefined : change.size;
  if ('font' in change) next.font = change.font === 'sans' ? undefined : change.font;
  return tidy(next);
}

/** Sets or removes `style` on an object, leaving no empty key behind. */
function withStyle<T extends { style?: TextStyle }>(o: T, style: TextStyle | undefined): T {
  const rest = { ...o };
  delete rest.style;
  return style ? { ...rest, style } : rest;
}

export function styleOf(board: Board, box: Box): TextStyle | undefined {
  if ('columnId' in box) return board.columns[box.columnId]?.style;
  const card = board.cards[box.cardId];
  if (!box.itemId) return card?.style;
  return card?.kind === 'todo' ? findItem(card.items, box.itemId)?.item.style : undefined;
}

/** Apply one change to every box. */
export function applyStyle(board: Board, boxes: Box[], change: StyleChange): Board {
  return boxes.reduce((b, box) => {
    if ('columnId' in box) {
      const col = b.columns[box.columnId];
      return col ? { ...b, columns: { ...b.columns, [col.id]: withStyle(col, changed(col.style, change)) } } : b;
    }
    const itemId = box.itemId;
    if (!itemId) return updateCard(b, box.cardId, (c) => withStyle(c, changed(c.style, change)));
    return editItems(b, box.cardId, (items) => {
      const next = structuredClone(items);
      const loc = findItem(next, itemId);
      if (!loc) return null;
      loc.list[loc.index] = withStyle(loc.item, changed(loc.item.style, change));
      return next;
    });
  }, board);
}

/** Bold / italic on several boxes: on for all, unless all have it already; then off for all. */
export function toggleChange(board: Board, boxes: Box[], what: 'bold' | 'italic'): StyleChange {
  const on = boxes.length > 0 && boxes.every((box) => styleOf(board, box)?.[what]);
  return what === 'bold' ? { bold: !on } : { italic: !on };
}

/** Ctrl+Shift+> / <: one size up or down from the first box's size, for all of them. */
export function sizeStepChange(board: Board, boxes: Box[], dir: 1 | -1): StyleChange {
  const now = SIZES.indexOf(styleOf(board, boxes[0])?.size ?? 'normal');
  return { size: SIZES[Math.min(SIZES.length - 1, Math.max(0, now + dir))] };
}

/** Every text box in these cards and columns (a column's title, then its cards'). */
export function boxesOf(board: Board, ids: string[]): Box[] {
  const ofCard = (cardId: string): Box[] => {
    const card = board.cards[cardId];
    if (!card || card.kind === 'completed') return [];
    if (card.kind !== 'todo') return [{ cardId }];
    return [{ cardId }, ...flatIds(card.items).map((itemId) => ({ cardId, itemId }))];
  };
  return ids.flatMap((id): Box[] => {
    const col = board.columns[id];
    if (col) return [{ columnId: id }, ...col.cardIds.flatMap(ofCard)];
    return blockOf(board, id) ? ofCard(id) : [];
  });
}

/** The CSS for a text box with this format (sizes go through `--ts`, which the stylesheet multiplies in). */
export function styleCss(style: TextStyle | undefined): Record<string, string | number> {
  if (!style) return {};
  const css: Record<string, string | number> = {};
  if (style.size) css['--ts'] = TEXT_SCALE[style.size];
  if (style.bold) css.fontWeight = 600;
  if (style.italic) css.fontStyle = 'italic';
  if (style.font) css.fontFamily = `var(--font-${style.font})`;
  return css;
}

/** A saved format, or undefined for anything unreadable. */
export function parseStyle(v: unknown): TextStyle | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const s = v as Record<string, unknown>;
  return tidy({
    size: s.size === 'small' || s.size === 'large' ? s.size : undefined,
    bold: s.bold === true || undefined,
    italic: s.italic === true || undefined,
    font: s.font === 'serif' || s.font === 'rounded' || s.font === 'hand' || s.font === 'mono' ? s.font : undefined,
  });
}
