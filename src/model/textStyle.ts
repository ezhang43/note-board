import { blockOf, updateCard } from './board';
import { editItems, findItem, flatIds } from './checklist';
import { MAX_SIZE, MIN_SIZE, nextSize } from './richText';
import type { Board, TextStyle } from './types';

// Formatting whole text boxes (owner request): a size in px (the Journal's size box, owner request
// 2026-11-19; it replaced Small / Normal / Large), bold, italic and a typeface. Always the whole box
// (a card title, a note's text, a checklist item, a column title), never single words, so the text
// boxes stay plain text.

/** One text box: a card's title or note text, a checklist item, or a column's title. */
export type Box = { cardId: string; itemId?: string } | { columnId: string };

export type TextFont = 'sans' | 'serif' | 'rounded' | 'hand' | 'mono';

/** One change from the format bar or a shortcut: `size` is a size in px from the list, `sizeStep` its − / +. */
export type StyleChange = { bold: boolean } | { italic: boolean } | { size: number } | { sizeStep: 1 | -1 } | { font: TextFont };

/** The usual size of a box's text in px at the A− / A+ Normal step (styles.css): a checklist's or link's title, and every other box. */
export const TITLE_PX = 15;
export const TEXT_PX = 14;
/** The words saved before the size box, as a share of the box's usual size: still drawn exactly so. */
const OLD_SCALE = { small: 0.85, large: 1.3 };

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
  if (s.size !== undefined) out.size = s.size;
  if (s.bold) out.bold = true;
  if (s.italic) out.italic = true;
  if (s.font) out.font = s.font;
  return Object.keys(out).length ? out : undefined;
}

/** A box's format after a change; `plain` is the box's usual px (the usual size is saved as no size). */
function changed(style: TextStyle | undefined, change: StyleChange, plain: number): TextStyle | undefined {
  const next: TextStyle = { ...style };
  if ('bold' in change) next.bold = change.bold || undefined;
  if ('italic' in change) next.italic = change.italic || undefined;
  const px = 'size' in change ? change.size : 'sizeStep' in change ? nextSize(shownPx(style, plain), change.sizeStep) : null;
  if (px !== null) next.size = px === plain ? undefined : px;
  if ('font' in change) next.font = change.font === 'sans' ? undefined : change.font;
  return tidy(next);
}

/** A box's usual size in px: a checklist's or link's title is 15, a note's text, an item and a container's title 14. */
export function plainPx(board: Board, box: Box): number {
  if ('columnId' in box || box.itemId) return TEXT_PX;
  return board.cards[box.cardId]?.kind === 'note' ? TEXT_PX : TITLE_PX;
}

/** The size in px the size box shows for a box: its number, its usual px, or the old Small / Large as the nearest whole px. */
export function shownPx(style: TextStyle | undefined, plain: number): number {
  const size = style?.size;
  if (size === undefined) return plain;
  return typeof size === 'number' ? size : Math.round(plain * OLD_SCALE[size]);
}

/** The size the size box shows for these boxes, or null when they differ (the box is then empty). */
export function sizesOf(board: Board, boxes: Box[]): number | null {
  const all = new Set(boxes.map((box) => shownPx(styleOf(board, box), plainPx(board, box))));
  return all.size === 1 ? [...all][0] : null;
}

const sameStyle = (a?: TextStyle, b?: TextStyle) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Sets or removes `style` on an object, leaving no empty key behind. */
function withStyle<T extends { style?: TextStyle }>(o: T, style: TextStyle | undefined): T {
  if (sameStyle(o.style, style)) return o; // nothing changes: no new object, so no undo step
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

/** Apply one change to every box. A checklist's items are changed together, in one copy of its items. */
export function applyStyle(board: Board, boxes: Box[], change: StyleChange): Board {
  const itemsOf = new Map<string, string[]>();
  let out = boxes.reduce((b, box) => {
    if ('columnId' in box) {
      const col = b.columns[box.columnId];
      const next = col && withStyle(col, changed(col.style, change, TEXT_PX));
      return col && next !== col ? { ...b, columns: { ...b.columns, [col.id]: next } } : b;
    }
    if (box.itemId) {
      itemsOf.set(box.cardId, [...(itemsOf.get(box.cardId) ?? []), box.itemId]);
      return b;
    }
    const plain = plainPx(b, box);
    return updateCard(b, box.cardId, (c) => withStyle(c, changed(c.style, change, plain)));
  }, board);
  for (const [cardId, ids] of itemsOf) {
    out = editItems(out, cardId, (items) => {
      if (!ids.some((id) => { const now = findItem(items, id)?.item; return now && !sameStyle(now.style, changed(now.style, change, TEXT_PX)); })) return null;
      const next = structuredClone(items);
      for (const id of ids) {
        const loc = findItem(next, id);
        if (loc) loc.list[loc.index] = withStyle(loc.item, changed(loc.item.style, change, TEXT_PX));
      }
      return next;
    });
  }
  return out;
}

/** Bold / italic on several boxes: on for all, unless all have it already; then off for all. */
export function toggleChange(board: Board, boxes: Box[], what: 'bold' | 'italic'): StyleChange {
  const on = boxes.length > 0 && boxes.every((box) => styleOf(board, box)?.[what]);
  return what === 'bold' ? { bold: !on } : { italic: !on };
}

/**
 * The Google Docs size keys, with Ctrl or ⌘ held: Shift+. (or >) is larger, Shift+, (or <) is smaller. Matched by the
 * character and by the key's position, so other layouts work too. Used by the board and by the Journal.
 */
export function sizeKeyDir(e: { key: string; code: string; shiftKey: boolean }): 1 | -1 | null {
  if (!e.shiftKey) return null;
  if (e.key === '>' || e.code === 'Period') return 1;
  if (e.key === '<' || e.code === 'Comma') return -1;
  return null;
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

/**
 * The CSS for a text box with this format, whose usual size is `plain` px. Sizes go through `--ts`, which the
 * stylesheet multiplies in (with the A− / A+ step): a number is its px over the usual px, the old words their share.
 */
export function styleCss(style: TextStyle | undefined, plain = TEXT_PX): Record<string, string | number> {
  if (!style) return {};
  const css: Record<string, string | number> = {};
  if (style.size !== undefined) css['--ts'] = typeof style.size === 'number' ? style.size / plain : OLD_SCALE[style.size];
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
    size: s.size === 'small' || s.size === 'large' || (typeof s.size === 'number' && s.size >= MIN_SIZE && s.size <= MAX_SIZE) ? s.size : undefined,
    bold: s.bold === true || undefined,
    italic: s.italic === true || undefined,
    font: s.font === 'serif' || s.font === 'rounded' || s.font === 'hand' || s.font === 'mono' ? s.font : undefined,
  });
}
